// Cron job management
let cronJobs = [];

async function initCron() {
  try {
    cronJobs = await API.get("/api/cron");
  } catch (e) {
    cronJobs = [];
    console.error("Failed to load cron jobs:", e);
  }
  renderCron();
}

function renderCron() {
  const el = document.getElementById("cron-list");

  const items = cronJobs
    .map((job, i) => {
      const enabled = job.enabled;
      const schedule = job.schedule || {};
      const expr = schedule.expr || "";
      const tz = schedule.tz || "";
      const state = job.state || {};
      const lastRun = state.lastCompletedAt ? timeAgo(state.lastCompletedAt) : "无";
      const status = state.lastStatus || "";
      const payload = job.payload || {};
      const message = payload.message || "";
      const preview = message.length > 80 ? message.substring(0, 80) + "..." : message;

      const statusBadge = status
        ? `<span class="badge ${status === "ok" ? "badge-ok" : "badge-error"}">${status}</span>`
        : "";

      return `
      <div class="cron-item" data-index="${i}">
        <button class="cron-toggle ${enabled ? "on" : ""}" data-action="toggle">${enabled ? "启用" : "禁用"}</button>
        <div class="cron-details">
          <div class="cron-name"><strong>${escCron(job.name || job.id)}</strong></div>
          <div class="cron-schedule"><code>${escCron(expr)}</code> (${escCron(tz)})</div>
          <div class="cron-status">上次运行: ${lastRun} ${statusBadge}</div>
          ${preview ? `<div class="cron-preview">${escCron(preview)}</div>` : ""}
        </div>
        <div class="cron-actions">
          <button data-action="edit">编辑</button>
          <button data-action="delete" class="btn-danger">删除</button>
        </div>
      </div>`;
    })
    .join("");

  el.innerHTML =
    items +
    `
      <div class="cron-add">
        <button id="btn-add-cron" class="btn-primary">添加任务</button>
      </div>`;

  // Delegated event listeners
  el.onclick = (e) => {
    const target = e.target;
    const action = target.dataset.action;
    if (!action) {
      return;
    }

    const item = target.closest(".cron-item");
    if (!item) {
      if (target.id === "btn-add-cron") {
        addCron();
      }
      return;
    }

    const idx = parseInt(item.dataset.index);

    if (action === "toggle") {
      toggleCron(idx);
    } else if (action === "edit") {
      editCron(idx);
    } else if (action === "delete") {
      deleteCron(idx);
    }
  };
}

async function toggleCron(idx) {
  try {
    cronJobs[idx].enabled = !cronJobs[idx].enabled;
    await API.put("/api/cron", cronJobs);
    toast(cronJobs[idx].name + (cronJobs[idx].enabled ? " 已启用" : " 已禁用"), "success");
    renderCron();
  } catch (e) {
    console.error("Failed to toggle cron job:", e);
  }
}

async function deleteCron(idx) {
  const job = cronJobs[idx];
  if (!confirm(`确认删除任务 "${job.name || job.id}"？`)) {
    return;
  }

  try {
    cronJobs.splice(idx, 1);
    await API.put("/api/cron", cronJobs);
    toast("任务已删除", "success");
    renderCron();
  } catch (e) {
    console.error("Failed to delete cron job:", e);
  }
}

function addCron() {
  const modal = document.getElementById("node-modal");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  modal.classList.remove("hidden");

  title.textContent = "添加新任务";
  body.innerHTML = `
    <label>名称</label>
    <input id="cron-name" placeholder="每日报告">
    <label>Cron 表达式 <small>(如: 0 9 * * 1-5 表示工作日早9点)</small></label>
    <input id="cron-expr" placeholder="0 9 * * 1-5">
    <label>时区</label>
    <input id="cron-tz" value="Asia/Singapore" placeholder="Asia/Singapore">
    <label>Agent ID</label>
    <input id="cron-agent" value="owner" placeholder="owner">
    <label>消息</label>
    <textarea id="cron-msg" rows="4" placeholder="生成今日工作报告"></textarea>
  `;

  document.getElementById("modal-save").onclick = async () => {
    const name = document.getElementById("cron-name").value.trim();
    const expr = document.getElementById("cron-expr").value.trim();
    const tz = document.getElementById("cron-tz").value.trim();
    const agentId = document.getElementById("cron-agent").value.trim();
    const message = document.getElementById("cron-msg").value.trim();

    if (!name || !expr || !tz || !agentId || !message) {
      toast("请填写所有必填字段", "error");
      return;
    }

    const newJob = {
      id: "job-" + Date.now(),
      name: name,
      enabled: true,
      schedule: { kind: "cron", expr: expr, tz: tz },
      agentId: agentId,
      payload: { kind: "agentTurn", message: message },
      state: {},
    };

    try {
      cronJobs.push(newJob);
      await API.put("/api/cron", cronJobs);
      toast("任务已添加", "success");
      modal.classList.add("hidden");
      renderCron();
    } catch (e) {
      console.error("Failed to add cron job:", e);
    }
  };
}

function editCron(idx) {
  const job = cronJobs[idx];
  const modal = document.getElementById("node-modal");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  modal.classList.remove("hidden");

  title.textContent = "编辑: " + (job.name || job.id);
  const schedule = job.schedule || {};
  const payload = job.payload || {};
  body.innerHTML = `
    <label>名称</label>
    <input id="cron-name" value="${escCron(job.name || "")}">
    <label>Cron 表达式 <small>(如: 0 9 * * 1-5 表示工作日早9点)</small></label>
    <input id="cron-expr" value="${escCron(schedule.expr || "")}" placeholder="0 9 * * 1-5">
    <label>时区</label>
    <input id="cron-tz" value="${escCron(schedule.tz || "")}" placeholder="Asia/Singapore">
    <label>Agent ID</label>
    <input id="cron-agent" value="${escCron(job.agentId || "")}">
    <label>消息</label>
    <textarea id="cron-msg" rows="4">${escCron(payload.message || "")}</textarea>
  `;

  document.getElementById("modal-save").onclick = async () => {
    const name = document.getElementById("cron-name").value.trim();
    const expr = document.getElementById("cron-expr").value.trim();
    const tz = document.getElementById("cron-tz").value.trim();
    const agentId = document.getElementById("cron-agent").value.trim();
    const message = document.getElementById("cron-msg").value.trim();

    if (!name || !expr || !tz || !agentId || !message) {
      toast("请填写所有必填字段", "error");
      return;
    }

    cronJobs[idx].name = name;
    cronJobs[idx].schedule = {
      kind: "cron",
      expr: expr,
      tz: tz,
    };
    cronJobs[idx].agentId = agentId;
    cronJobs[idx].payload = {
      kind: "agentTurn",
      message: message,
    };

    try {
      await API.put("/api/cron", cronJobs);
      toast("已保存", "success");
      modal.classList.add("hidden");
      renderCron();
    } catch (e) {
      console.error("Failed to update cron job:", e);
    }
  };
}

function timeAgo(ts) {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) {
    return diff + "秒前";
  }
  if (diff < 3600) {
    return Math.floor(diff / 60) + "分钟前";
  }
  if (diff < 86400) {
    return Math.floor(diff / 3600) + "小时前";
  }
  return Math.floor(diff / 86400) + "天前";
}

function escCron(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
