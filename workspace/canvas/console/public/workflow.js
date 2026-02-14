// Workflow editor using Drawflow
let editor;
let configData = null;

async function initWorkflow() {
  const container = document.getElementById("drawflow");
  if (!container) {
    return;
  }

  if (editor) {
    editor.clear();
    editor = null;
  }
  container.innerHTML = "";

  editor = new Drawflow(container);
  editor.reroute = true;
  editor.start();

  try {
    configData = await API.get("/api/config");
    renderWorkflowFromConfig(configData);
  } catch (err) {
    console.error("Failed to load config:", err);
    toast("加载配置失败");
    return;
  }

  editor.on("nodeSelected", (nodeId) => {
    const node = editor.getNodeFromId(nodeId);
    if (node && node.data) {
      openNodeModal(nodeId, node.data);
    }
  });
}

function renderWorkflowFromConfig(config) {
  editor.clear();
  const agents = config.agents || {};
  const defaults = agents.defaults || {};
  const models = Object.keys(defaults.models || {});
  const list = agents.list || [];
  const channels = config.channels || {};
  const bindings = config.bindings || [];
  const channelNames = Object.keys(channels);

  // Layout constants
  const colW = 240;
  const rowH = 220;
  const startX = 60;

  // === ROW 1: Models (top) ===
  const modelNodes = {};
  models.forEach((m, i) => {
    const shortName = m.split("/").pop();
    const provider = m.split("/")[0];
    const isPrimary = defaults.model && defaults.model.primary === m;
    const html = `
      <div class="node-type">模型</div>
      <div class="title-box">${escWf(shortName)}${isPrimary ? " ★" : ""}</div>
      <div class="node-detail">${escWf(provider)}</div>`;
    const id = editor.addNode(
      shortName,
      0,
      1,
      startX + i * colW,
      40,
      isPrimary ? "model-node primary" : "model-node",
      { type: "model", fullName: m, isPrimary },
      html,
    );
    modelNodes[m] = id;
  });

  // === ROW 2: Router (center) ===
  const routerHtml = `
      <div class="node-type">路由器</div>
      <div class="title-box">🔀 Message Router</div>
      <div class="node-detail">${bindings.length} 条路由规则</div>`;
  const totalWidth = Math.max(models.length, list.length, channelNames.length) * colW;
  const routerX = startX + (totalWidth - colW) / 2;
  const routerId = editor.addNode(
    "router",
    1,
    1,
    routerX,
    40 + rowH,
    "router-node",
    { type: "router" },
    routerHtml,
  );

  // Connect primary model → router
  const primaryModel = defaults.model && defaults.model.primary;
  if (primaryModel && modelNodes[primaryModel]) {
    editor.addConnection(modelNodes[primaryModel], routerId, "output_1", "input_1");
  }

  // === ROW 3: Agents ===
  const agentNodes = {};
  list.forEach((agent, i) => {
    const profile = agent.tools ? agent.tools.profile : "full";
    // Count bindings for this agent
    const agentBindings = bindings.filter((b) => b.agentId === agent.id);
    const html = `
      <div class="node-type">Agent</div>
      <div class="title-box">${escWf(agent.name)} (${escWf(agent.id)})</div>
      <div class="node-detail">权限: ${escWf(profile)} · ${agentBindings.length} 绑定</div>`;
    const id = editor.addNode(
      agent.id,
      1,
      1,
      startX + i * colW,
      40 + rowH * 2,
      "agent-node",
      { type: "agent", agentId: agent.id, ...agent },
      html,
    );
    agentNodes[agent.id] = id;

    // Connect router → agent
    editor.addConnection(routerId, id, "output_1", "input_1");
  });

  // === ROW 4: Channels (bottom) ===
  channelNames.forEach((ch, i) => {
    const chConfig = channels[ch];
    const enabled = chConfig.enabled !== false;
    const allowFrom = chConfig.allowFrom || [];
    const html = `
      <div class="node-type">通道</div>
      <div class="title-box">${escWf(ch)}</div>
      <div class="node-detail">${enabled ? "✅" : "❌"} · ${allowFrom.length} 白名单</div>`;
    const id = editor.addNode(
      ch,
      1,
      0,
      startX + i * colW,
      40 + rowH * 3,
      "channel-node",
      { type: "channel", name: ch, enabled, ...chConfig },
      html,
    );

    // Connect agents that have bindings on this channel → channel
    const channelAgents = [
      ...new Set(bindings.filter((b) => b.match && b.match.channel === ch).map((b) => b.agentId)),
    ];
    for (const agentId of channelAgents) {
      if (agentNodes[agentId]) {
        editor.addConnection(agentNodes[agentId], id, "output_1", "input_1");
      }
    }
  });
}

function openNodeModal(nodeId, data) {
  const modal = document.getElementById("node-modal");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  modal.classList.remove("hidden");

  if (data.type === "model") {
    title.textContent = "模型: " + data.fullName;
    body.innerHTML = `
      <label>完整名称</label><input value="${escWf(data.fullName)}" disabled>
      <label><input type="checkbox" id="chk-primary" ${data.isPrimary ? "checked" : ""}> 设为主模型</label>`;
  } else if (data.type === "router") {
    title.textContent = "Message Router";
    const bindings = configData.bindings || [];
    const rows = bindings
      .map((b, i) => {
        const ch = b.match ? b.match.channel : "?";
        const peer = b.match && b.match.peer ? b.match.peer.id : "?";
        return `<tr><td>${escWf(ch)}</td><td style="font-family:monospace">${escWf(peer)}</td><td>${escWf(b.agentId)}</td></tr>`;
      })
      .join("");
    body.innerHTML = `
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">消息路由：根据来源号码/ID将消息分配给不同 Agent</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border);color:var(--text-muted)">通道</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border);color:var(--text-muted)">号码/ID</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border);color:var(--text-muted)">Agent</th></tr>
        ${rows}
      </table>`;
  } else if (data.type === "agent") {
    title.textContent = "Agent: " + data.name;
    const profile = data.tools ? data.tools.profile : "full";
    const deny = data.tools && data.tools.deny ? data.tools.deny.join(", ") : "";
    body.innerHTML = `
      <label>ID</label><input value="${escWf(data.agentId)}" disabled>
      <label>工具权限</label>
      <select id="sel-profile">
        <option value="full" ${profile === "full" ? "selected" : ""}>full</option>
        <option value="messaging" ${profile === "messaging" ? "selected" : ""}>messaging</option>
        <option value="minimal" ${profile === "minimal" ? "selected" : ""}>minimal</option>
      </select>
      <label>禁用工具 (逗号分隔)</label><input id="inp-deny" value="${escWf(deny)}">
      <label>最大上下文 Tokens</label><input id="inp-ctx" type="number" value="${data.contextTokens || ""}" placeholder="400000">
      <label>每日 Token 预算</label><input id="inp-budget" type="number" value="${data.dailyBudget || ""}" placeholder="不限">`;
  } else if (data.type === "channel") {
    title.textContent = "通道: " + data.name;
    const allowFrom = data.allowFrom || [];
    body.innerHTML = `
      <label><input type="checkbox" id="chk-enabled" ${data.enabled !== false ? "checked" : ""}> 启用</label>
      <label>白名单 (${allowFrom.length})</label>
      <div style="max-height:200px;overflow-y:auto;font-family:monospace;font-size:12px;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
        ${allowFrom.map((n) => `<div style="padding:2px 0">${escWf(n)}</div>`).join("") || '<span style="color:var(--text-muted)">无白名单</span>'}
      </div>`;
  }

  document.getElementById("modal-save").onclick = async () => {
    try {
      if (data.type === "model") {
        if (document.getElementById("chk-primary").checked) {
          configData.agents.defaults.model.primary = data.fullName;
        }
      } else if (data.type === "agent") {
        const agentIdx = configData.agents.list.findIndex((a) => a.id === data.agentId);
        if (agentIdx >= 0) {
          const profile = document.getElementById("sel-profile").value;
          const deny = document
            .getElementById("inp-deny")
            .value.split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          configData.agents.list[agentIdx].tools = { profile };
          if (deny.length) {
            configData.agents.list[agentIdx].tools.deny = deny;
          }

          const ctx = document.getElementById("inp-ctx").value;
          if (ctx) {
            const v = parseInt(ctx, 10);
            if (!isNaN(v)) {
              configData.agents.list[agentIdx].contextTokens = v;
            }
          }
          const budget = document.getElementById("inp-budget").value;
          if (budget) {
            const v = parseInt(budget, 10);
            if (!isNaN(v)) {
              configData.agents.list[agentIdx].dailyBudget = v;
            }
          }
        }
      } else if (data.type === "channel") {
        configData.channels[data.name].enabled = document.getElementById("chk-enabled").checked;
      } else if (data.type === "router") {
        modal.classList.add("hidden");
        return;
      }

      await API.put("/api/config", configData);
      toast("配置已保存");
      modal.classList.add("hidden");
      renderWorkflowFromConfig(configData);
    } catch (err) {
      console.error("Failed to save:", err);
      toast("保存失败");
    }
  };
}

function escWf(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
