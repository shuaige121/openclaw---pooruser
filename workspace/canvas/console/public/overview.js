// Overview panel - interactive dashboard
// Complete rewrite with security fixes, proper event delegation, and error handling

// ===== MODULE STATE =====
let ovConfig = null;
let ovDash = null;
let ovCron = null;

// ===== INITIALIZATION =====
async function initOverview() {
  // Load all data in parallel, with fallbacks on error
  [ovConfig, ovDash, ovCron] = await Promise.all([
    API.get("/api/config").catch(() => ({})),
    API.get("/api/dashboard").catch(() => ({
      identity: {},
      contacts: [],
      tools: [],
      timeline: [],
    })),
    API.get("/api/cron").catch(() => []),
  ]);

  // Render all sections
  renderOvIdentity();
  renderOvModels();
  renderOvAgents();
  renderOvChannels();
  renderOvCron();
  renderOvContacts();
  renderOvTimeline();
  renderOvTools();

  // Attach delegated event listeners
  attachEventListeners();
}

// ===== HELPER FUNCTIONS =====

// HTML escape with single quote escaping for data attributes
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Safe integer parsing with NaN check
function safeInt(val) {
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? undefined : n;
}

// Time ago formatter with validation
function timeAgo(ts) {
  if (!ts) {
    return "从未";
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    return "未知";
  }
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return "刚刚";
  }
  if (mins < 60) {
    return mins + " 分钟前";
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return hrs + " 小时前";
  }
  return Math.floor(hrs / 24) + " 天前";
}

// Modal helper with error handling
function openModal(title, bodyHtml, onSave) {
  const modal = document.getElementById("node-modal");
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  modal.classList.remove("hidden");
  document.getElementById("modal-save").onclick = async () => {
    try {
      await onSave();
      modal.classList.add("hidden");
    } catch (e) {
      toast("保存失败: " + e.message, "error");
    }
  };
}

// ===== DELEGATED EVENT LISTENERS =====
function attachEventListeners() {
  // Identity section - edit button
  const identityEl = document.getElementById("ov-identity");
  if (identityEl) {
    identityEl.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="edit-identity"]')) {
        editIdentity();
      }
    });
  }

  // Models section
  const modelsEl = document.getElementById("ov-models");
  if (modelsEl) {
    modelsEl.addEventListener("click", (e) => {
      const target = e.target;

      // Add model button
      if (target.closest('[data-action="add-model"]')) {
        addModel();
        return;
      }

      // Model item actions
      const item = target.closest("[data-model-key]");
      if (item) {
        const key = item.dataset.modelKey;
        const action = target.closest("[data-action]");

        if (action) {
          const actionType = action.dataset.action;
          if (actionType === "set-primary") {
            setPrimaryModel(key);
          } else if (actionType === "delete") {
            deleteModel(key);
          }
        } else if (!target.closest("button")) {
          // Click on item itself (not a button) - set as primary
          setPrimaryModel(key);
        }
      }
    });
  }

  // Agents section
  const agentsEl = document.getElementById("ov-agents");
  if (agentsEl) {
    agentsEl.addEventListener("click", (e) => {
      const row = e.target.closest("[data-agent-idx]");
      if (row) {
        const idx = safeInt(row.dataset.agentIdx);
        if (idx !== undefined) {
          editAgent(idx);
        }
      }
    });
  }

  // Channels section
  const channelsEl = document.getElementById("ov-channels");
  if (channelsEl) {
    channelsEl.addEventListener("click", (e) => {
      const item = e.target.closest("[data-channel-name]");
      if (!item) {
        return;
      }

      const name = item.dataset.channelName;
      const action = e.target.closest("[data-action]");

      if (action) {
        const actionType = action.dataset.action;
        if (actionType === "config") {
          editChannel(name);
        } else if (actionType === "toggle") {
          toggleChannel(name);
        }
      }
    });
  }

  // Cron section
  const cronEl = document.getElementById("ov-cron");
  if (cronEl) {
    cronEl.addEventListener("click", (e) => {
      const item = e.target.closest("[data-cron-idx]");
      if (!item) {
        return;
      }

      const idx = safeInt(item.dataset.cronIdx);
      if (idx === undefined) {
        return;
      }

      const action = e.target.closest("[data-action]");
      if (action) {
        const actionType = action.dataset.action;
        if (actionType === "toggle") {
          toggleOvCron(idx);
        } else if (actionType === "delete") {
          deleteOvCron(idx);
        }
      }
    });
  }

  // Contacts section
  const contactsEl = document.getElementById("ov-contacts");
  if (contactsEl) {
    contactsEl.addEventListener("click", (e) => {
      // Add contact button
      if (e.target.closest('[data-action="add-contact"]')) {
        addContact();
        return;
      }

      // Contact row actions
      const row = e.target.closest("[data-contact-idx]");
      if (row) {
        const idx = safeInt(row.dataset.contactIdx);
        if (idx === undefined) {
          return;
        }

        const action = e.target.closest("[data-action]");
        if (action && action.dataset.action === "delete") {
          deleteContact(idx);
        } else if (!e.target.closest("button")) {
          editContact(idx);
        }
      }
    });
  }

  // Tools section
  const toolsEl = document.getElementById("ov-tools");
  if (toolsEl) {
    toolsEl.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tool-idx]");
      if (chip) {
        const idx = safeInt(chip.dataset.toolIdx);
        if (idx !== undefined) {
          showToolDetail(idx);
        }
      }

      // Close detail panel
      if (e.target.closest('[data-action="close-detail"]')) {
        const detail = document.getElementById("tool-detail");
        if (detail) {
          detail.classList.add("hidden");
        }
      }
    });
  }
}

// ===== IDENTITY SECTION =====
function renderOvIdentity() {
  const id = ovDash.identity || {};
  const el = document.getElementById("ov-identity");
  el.className = "card identity-hero";
  const tags = (id.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  el.innerHTML = `
        <button class="btn-edit-float" data-action="edit-identity" title="编辑">✏️</button>
        <div class="avatar-ring">${esc(id.emoji || "🐱")}</div>
        <div class="identity-name">${esc(id.name || "酒酒")} <span class="identity-name-sub">${esc(id.pinyin || "")}</span></div>
        <div class="identity-origin">${esc(id.origin || "")}</div>
        <div class="identity-tags">${tags}</div>
        <p class="identity-quote">"${esc(id.quote || "")}"</p>`;
}

function editIdentity() {
  const id = ovDash.identity || {};
  openModal(
    "编辑身份",
    `
        <label>头像 Emoji</label><input id="m-emoji" value="${esc(id.emoji || "🐱")}">
        <label>名字</label><input id="m-name" value="${esc(id.name || "")}">
        <label>拼音</label><input id="m-pinyin" value="${esc(id.pinyin || "")}">
        <label>来历</label><input id="m-origin" value="${esc(id.origin || "")}">
        <label>标签（逗号分隔）</label><input id="m-tags" value="${esc((id.tags || []).join(", "))}">
        <label>语录</label><input id="m-quote" value="${esc(id.quote || "")}">
    `,
    async () => {
      ovDash.identity = {
        emoji: document.getElementById("m-emoji").value.trim(),
        name: document.getElementById("m-name").value.trim(),
        pinyin: document.getElementById("m-pinyin").value.trim(),
        origin: document.getElementById("m-origin").value.trim(),
        tags: document
          .getElementById("m-tags")
          .value.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        quote: document.getElementById("m-quote").value.trim(),
      };
      await API.put("/api/dashboard", ovDash);
      toast("身份已更新");
      renderOvIdentity();
    },
  );
}

// ===== MODELS SECTION =====
function renderOvModels() {
  const el = document.getElementById("ov-models");
  el.className = "card";
  const defaults = (ovConfig.agents && ovConfig.agents.defaults) || {};
  const models = defaults.models || {};
  const primary = (defaults.model && defaults.model.primary) || "";
  const modelKeys = Object.keys(models);

  const items = modelKeys
    .map((key) => {
      const entry = models[key] || {};
      const alias = entry.alias || "";
      const provider = key.split("/")[0];
      const name = key.split("/").pop();
      const isPrimary = key === primary;
      return `
        <div class="model-item ${isPrimary ? "active" : ""}" data-model-key="${esc(key)}">
            <div class="model-dot"></div>
            <div style="flex:1">
                <div class="model-name">${esc(name)}${alias ? " (" + esc(alias) + ")" : ""}</div>
                <div class="model-provider">${esc(provider)}${isPrimary ? " · 主力模型" : ""}</div>
            </div>
            ${isPrimary ? "" : `<button class="btn-sm" data-action="set-primary">设为主力</button>`}
            <button class="btn-sm danger" data-action="delete">删除</button>
        </div>`;
    })
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">🧠</span>
            <span class="card-title">模型管理</span>
            <span class="card-badge">${modelKeys.length} 个模型</span>
        </div>
        <div class="model-list">${items || '<div style="color:var(--text-muted);font-size:13px">暂无模型</div>'}</div>
        <button class="btn-add" data-action="add-model">+ 添加模型</button>
        <div class="command-hint">💡 远程切换：发送 <code>/model claude</code> 或 <code>/model gpt5.3</code> 到 WhatsApp/Telegram</div>`;
}

function addModel() {
  openModal(
    "添加模型",
    `
        <label>Provider / Model ID（如 openai/gpt-5.3）</label><input id="m-model-id" placeholder="provider/model-name">
        <label>别名（可选，如 gpt5）</label><input id="m-model-alias" placeholder="快速切换用">
    `,
    async () => {
      const id = document.getElementById("m-model-id").value.trim();
      const alias = document.getElementById("m-model-alias").value.trim();

      if (!id) {
        toast("请输入模型 ID", "error");
        throw new Error("Model ID required");
      }

      if (!id.includes("/")) {
        toast("模型 ID 格式错误，应为 provider/model-name", "error");
        throw new Error("Invalid model ID format");
      }

      if (!ovConfig.agents) {
        ovConfig.agents = {};
      }
      if (!ovConfig.agents.defaults) {
        ovConfig.agents.defaults = {};
      }
      if (!ovConfig.agents.defaults.models) {
        ovConfig.agents.defaults.models = {};
      }

      ovConfig.agents.defaults.models[id] = alias ? { alias } : {};

      await API.put("/api/config", ovConfig);
      toast("模型已添加");
      renderOvModels();
    },
  );
}

async function deleteModel(key) {
  if (!confirm(`确认删除模型 ${key}？`)) {
    return;
  }

  try {
    delete ovConfig.agents.defaults.models[key];

    // If deleting primary model, set first remaining as primary
    if (ovConfig.agents.defaults.model && ovConfig.agents.defaults.model.primary === key) {
      const remaining = Object.keys(ovConfig.agents.defaults.models);
      ovConfig.agents.defaults.model.primary = remaining[0] || "";
    }

    await API.put("/api/config", ovConfig);
    toast("模型已删除");
    renderOvModels();
  } catch (e) {
    toast("删除失败: " + e.message, "error");
  }
}

async function setPrimaryModel(key) {
  try {
    if (!ovConfig.agents.defaults.model) {
      ovConfig.agents.defaults.model = {};
    }
    ovConfig.agents.defaults.model.primary = key;

    await API.put("/api/config", ovConfig);
    toast("已设为主力模型");
    renderOvModels();
  } catch (e) {
    toast("设置失败: " + e.message, "error");
  }
}

// ===== AGENTS SECTION =====
function renderOvAgents() {
  const el = document.getElementById("ov-agents");
  el.className = "card";
  const list = (ovConfig.agents && ovConfig.agents.list) || [];

  const rows = list
    .map((a, i) => {
      const profile = (a.tools && a.tools.profile) || "full";
      const badgeClass = profile === "minimal" ? "muted" : "blue";
      return `
        <div class="info-row clickable" data-agent-idx="${i}">
            <span class="info-icon">${getAgentIcon(a.id)}</span>
            <span class="info-name">${esc(a.name || a.id)}</span>
            <span class="info-badge ${badgeClass}">${esc(profile)}</span>
            <span class="info-hint">${getAgentHint(a)}</span>
            <span class="row-arrow">›</span>
        </div>`;
    })
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">🤖</span>
            <span class="card-title">Agent 角色</span>
            <span class="card-badge">${list.length} 个角色</span>
        </div>
        <div class="info-list">${rows}</div>`;
}

function getAgentIcon(id) {
  const icons = {
    owner: "👑",
    family: "👨‍👩‍👧‍👦",
    parents: "👴",
    "maple-education": "🍁",
    friend: "👋",
    "duduxiang-boss": "🍜",
  };
  return icons[id] || "🤖";
}

function getAgentHint(a) {
  const profile = (a.tools && a.tools.profile) || "full";
  const hints = {
    full: "完整权限",
    messaging: "消息交互",
    minimal: "最小权限",
  };
  return hints[profile] || profile;
}

function editAgent(idx) {
  const a = ovConfig.agents.list[idx];
  const profile = (a.tools && a.tools.profile) || "full";
  const deny = a.tools && a.tools.deny ? a.tools.deny.join(", ") : "";

  openModal(
    `编辑 Agent: ${a.name || a.id}`,
    `
        <label>名称</label><input id="m-a-name" value="${esc(a.name || "")}">
        <label>工具权限</label>
        <select id="m-a-profile">
            <option value="full" ${profile === "full" ? "selected" : ""}>full (完整权限)</option>
            <option value="messaging" ${profile === "messaging" ? "selected" : ""}>messaging (消息交互)</option>
            <option value="minimal" ${profile === "minimal" ? "selected" : ""}>minimal (最小权限)</option>
        </select>
        <label>禁用工具（逗号分隔）</label><input id="m-a-deny" value="${esc(deny)}">
        <label>最大上下文 Tokens</label><input id="m-a-ctx" type="number" value="${a.contextTokens || ""}" placeholder="如 400000">
        <label>每日 Token 预算</label><input id="m-a-budget" type="number" value="${a.dailyBudget || ""}" placeholder="不限">
        <label>工作时间</label><input id="m-a-hours" value="${esc(a.workHours || "")}" placeholder="如 09:00-22:00">
    `,
    async () => {
      const agent = ovConfig.agents.list[idx];
      agent.name = document.getElementById("m-a-name").value.trim();
      agent.tools = { profile: document.getElementById("m-a-profile").value };

      const denyVal = document
        .getElementById("m-a-deny")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (denyVal.length) {
        agent.tools.deny = denyVal;
      }

      const ctx = safeInt(document.getElementById("m-a-ctx").value);
      if (ctx !== undefined) {
        agent.contextTokens = ctx;
      } else {
        delete agent.contextTokens;
      }

      const budget = safeInt(document.getElementById("m-a-budget").value);
      if (budget !== undefined) {
        agent.dailyBudget = budget;
      } else {
        delete agent.dailyBudget;
      }

      const hours = document.getElementById("m-a-hours").value.trim();
      if (hours) {
        agent.workHours = hours;
      } else {
        delete agent.workHours;
      }

      await API.put("/api/config", ovConfig);
      toast(`${agent.name} 已更新`);
      renderOvAgents();
    },
  );
}

// ===== CHANNELS SECTION =====
function renderOvChannels() {
  const el = document.getElementById("ov-channels");
  el.className = "card";
  const channels = ovConfig.channels || {};
  const bindings = ovConfig.bindings || [];
  const channelIcons = {
    whatsapp: "💬",
    telegram: "✈️",
    imessage: "💭",
    discord: "🎮",
    signal: "🔒",
    slack: "💼",
    line: "🟢",
  };
  const channelNames = Object.keys(channels);

  const items = channelNames
    .map((name) => {
      const ch = channels[name];
      const enabled = ch.enabled !== false;
      const icon = channelIcons[name] || "📡";
      const allowFrom = ch.allowFrom || [];
      const dmPolicy = ch.dmPolicy || "未设置";
      const groupPolicy = ch.groupPolicy || "未设置";

      // Count bindings for this channel
      const channelBindings = bindings.filter((b) => b.match && b.match.channel === name);
      const agentSet = [...new Set(channelBindings.map((b) => b.agentId))];

      // Show whitelist numbers with agent mapping
      const wlItems = allowFrom
        .map((num) => {
          const binding = channelBindings.find(
            (b) => b.match && b.match.peer && b.match.peer.id === num,
          );
          const agent = binding ? binding.agentId : "未绑定";
          return `<div class="wl-item"><span class="wl-num">${esc(num)}</span><span class="wl-agent">${esc(agent)}</span></div>`;
        })
        .join("");

      return `
        <div class="channel-item" data-channel-name="${esc(name)}">
            <div class="channel-top">
                <span class="channel-icon">${icon}</span>
                <div style="flex:1">
                    <div class="channel-name">${esc(name)}</div>
                    <div class="channel-detail">DM: ${esc(dmPolicy)} · 群组: ${esc(groupPolicy)}${agentSet.length ? " · Agent: " + agentSet.map((a) => esc(a)).join(", ") : ""}</div>
                </div>
                <button class="btn-sm" data-action="config">配置</button>
                <button class="toggle-pill ${enabled ? "on" : ""}" data-action="toggle">
                    <span class="toggle-knob"></span>
                </button>
            </div>
            ${allowFrom.length ? `<div class="wl-list"><div class="wl-header">白名单 (${allowFrom.length})</div>${wlItems}</div>` : ""}
        </div>`;
    })
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">📱</span>
            <span class="card-title">消息通道</span>
            <span class="card-badge">${channelNames.length} 个通道</span>
        </div>
        <div class="info-list">${items}</div>`;
}

async function toggleChannel(name) {
  try {
    const ch = ovConfig.channels[name];
    ch.enabled = ch.enabled === false ? true : false;

    await API.put("/api/config", ovConfig);
    toast(`${name} 已${ch.enabled ? "启用" : "禁用"}`);
    renderOvChannels();
  } catch (e) {
    toast("切换失败: " + e.message, "error");
  }
}

function editChannel(name) {
  const ch = ovConfig.channels[name];
  const allowFrom = ch.allowFrom || [];

  openModal(
    `配置通道: ${name}`,
    `
        <label>DM 白名单（每行一个号码/ID）</label>
        <textarea id="m-ch-dm" rows="8" style="height:auto">${allowFrom.join("\n")}</textarea>
        <label>DM 策略</label>
        <select id="m-ch-dm-policy">
            <option value="allowlist" ${ch.dmPolicy === "allowlist" ? "selected" : ""}>allowlist</option>
            <option value="pairing" ${ch.dmPolicy === "pairing" ? "selected" : ""}>pairing</option>
            <option value="open" ${ch.dmPolicy === "open" ? "selected" : ""}>open</option>
        </select>
        <label>群组策略</label>
        <select id="m-ch-group-policy">
            <option value="allowlist" ${ch.groupPolicy === "allowlist" ? "selected" : ""}>allowlist</option>
            <option value="open" ${ch.groupPolicy === "open" ? "selected" : ""}>open</option>
        </select>
        <div style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
            <label style="margin:0;font-size:11px;color:var(--text-muted)">完整配置 (JSON)</label>
            <textarea id="m-ch-json" rows="8" style="height:auto;font-family:monospace;font-size:11px">${JSON.stringify(ch, null, 2)}</textarea>
        </div>
    `,
    async () => {
      try {
        const updated = JSON.parse(document.getElementById("m-ch-json").value);
        ovConfig.channels[name] = updated;
        await API.put("/api/config", ovConfig);
        toast(`${name} 配置已保存`);
        renderOvChannels();
      } catch (e) {
        toast("JSON 格式错误: " + e.message, "error");
        throw e;
      }
    },
  );
}

// ===== CRON SECTION =====
function renderOvCron() {
  const el = document.getElementById("ov-cron");
  el.className = "card";

  const items = ovCron
    .map((job, i) => {
      const enabled = job.enabled;
      const schedule = job.schedule || {};
      const state = job.state || {};
      const lastRun = state.lastCompletedAt ? timeAgo(state.lastCompletedAt) : "从未运行";
      const lastStatus = state.lastStatus || "";
      const statusClass = lastStatus === "ok" ? "on" : lastStatus ? "off" : "";

      return `
        <div class="cron-ov-item" data-cron-idx="${i}">
            <div class="cron-ov-top">
                <button class="toggle-pill ${enabled ? "on" : ""}" data-action="toggle">
                    <span class="toggle-knob"></span>
                </button>
                <span class="cron-ov-name">${esc(job.name || job.id)}</span>
                <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
                    ${statusClass ? `<span class="status-badge ${statusClass}">${esc(lastStatus)}</span>` : ""}
                    <button class="btn-sm danger" data-action="delete">删除</button>
                </div>
            </div>
            <div class="cron-ov-meta">
                <span>${esc(schedule.expr || "")} ${schedule.tz ? "(" + esc(schedule.tz) + ")" : ""}</span>
                <span>上次: ${lastRun}</span>
            </div>
        </div>`;
    })
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">⏰</span>
            <span class="card-title">定时任务</span>
            <span class="card-badge">${ovCron.length} 个任务</span>
        </div>
        <div class="info-list">${items}</div>`;
}

async function toggleOvCron(idx) {
  try {
    ovCron[idx].enabled = !ovCron[idx].enabled;
    await API.put("/api/cron", ovCron);
    toast(ovCron[idx].name + (ovCron[idx].enabled ? " 已启用" : " 已暂停"));
    renderOvCron();
  } catch (e) {
    toast("切换失败: " + e.message, "error");
  }
}

async function deleteOvCron(idx) {
  const name = ovCron[idx].name || ovCron[idx].id;
  if (!confirm(`确认删除定时任务 "${name}"？`)) {
    return;
  }

  try {
    ovCron.splice(idx, 1);
    await API.put("/api/cron", ovCron);
    toast(`${name} 已删除`);
    renderOvCron();
  } catch (e) {
    toast("删除失败: " + e.message, "error");
  }
}

// ===== CONTACTS SECTION =====
function renderOvContacts() {
  const el = document.getElementById("ov-contacts");
  el.className = "card";
  const contacts = ovDash.contacts || [];

  const rows = contacts
    .map(
      (c, i) => `
        <div class="contact-row clickable" data-contact-idx="${i}">
            <div class="contact-avatar">${esc(c.emoji || "👤")}</div>
            <div style="flex:1">
                <div class="contact-name">${esc(c.name)}</div>
                <div class="contact-role">${esc(c.role)}</div>
            </div>
            <button class="btn-sm danger" data-action="delete">删除</button>
            <span class="row-arrow">›</span>
        </div>`,
    )
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">👥</span>
            <span class="card-title">重要联系人</span>
            <span class="card-badge">${contacts.length} 人</span>
        </div>
        <div class="contact-list">${rows}</div>
        <button class="btn-add" data-action="add-contact">+ 添加联系人</button>`;
}

function addContact() {
  openModal(
    "添加联系人",
    `
        <label>头像 Emoji</label><input id="m-c-emoji" value="👤">
        <label>姓名</label><input id="m-c-name">
        <label>角色/描述</label><input id="m-c-role">
    `,
    async () => {
      const emoji = document.getElementById("m-c-emoji").value.trim();
      const name = document.getElementById("m-c-name").value.trim();
      const role = document.getElementById("m-c-role").value.trim();

      if (!name) {
        toast("请输入姓名", "error");
        throw new Error("Name required");
      }

      if (!ovDash.contacts) {
        ovDash.contacts = [];
      }
      ovDash.contacts.push({ emoji, name, role });
      await API.put("/api/dashboard", ovDash);
      toast("联系人已添加");
      renderOvContacts();
    },
  );
}

function editContact(idx) {
  const c = ovDash.contacts[idx];
  openModal(
    "编辑联系人",
    `
        <label>头像 Emoji</label><input id="m-c-emoji" value="${esc(c.emoji)}">
        <label>姓名</label><input id="m-c-name" value="${esc(c.name)}">
        <label>角色/描述</label><input id="m-c-role" value="${esc(c.role)}">
    `,
    async () => {
      const emoji = document.getElementById("m-c-emoji").value.trim();
      const name = document.getElementById("m-c-name").value.trim();
      const role = document.getElementById("m-c-role").value.trim();

      if (!name) {
        toast("请输入姓名", "error");
        throw new Error("Name required");
      }

      ovDash.contacts[idx] = { emoji, name, role };
      await API.put("/api/dashboard", ovDash);
      toast("联系人已更新");
      renderOvContacts();
    },
  );
}

async function deleteContact(idx) {
  const name = ovDash.contacts[idx].name;
  if (!confirm(`确认删除联系人 "${name}"？`)) {
    return;
  }

  try {
    ovDash.contacts.splice(idx, 1);
    await API.put("/api/dashboard", ovDash);
    toast(`${name} 已删除`);
    renderOvContacts();
  } catch (e) {
    toast("删除失败: " + e.message, "error");
  }
}

// ===== TIMELINE SECTION =====
function renderOvTimeline() {
  const el = document.getElementById("ov-timeline");
  el.className = "card";
  const items = ovDash.timeline || [];

  const html = items
    .map(
      (t) => `
        <div class="timeline-item ${t.type || ""}">
            <div class="timeline-date">${esc(t.date)}</div>
            <div class="timeline-title">${esc(t.title)}</div>
        </div>`,
    )
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">📝</span>
            <span class="card-title">记忆时间线</span>
            <span class="card-badge">${items.length} 条</span>
        </div>
        <div class="timeline">${html}</div>`;
}

// ===== TOOLS SECTION =====
function renderOvTools() {
  const el = document.getElementById("ov-tools");
  el.className = "card";
  const tools = ovDash.tools || [];

  const chips = tools
    .map(
      (t, i) => `
        <div class="tool-chip clickable" data-tool-idx="${i}">
            <span class="emoji">${esc(t.emoji)}</span>
            <span class="name">${esc(t.name)}</span>
        </div>`,
    )
    .join("");

  el.innerHTML = `
        <div class="card-header">
            <span class="card-icon">🧰</span>
            <span class="card-title">工具箱</span>
            <span class="card-badge">${tools.length} 个工具</span>
        </div>
        <div class="tools-grid">${chips}</div>
        <div id="tool-detail" class="tool-detail hidden"></div>`;
}

function showToolDetail(idx) {
  const t = ovDash.tools[idx];
  const el = document.getElementById("tool-detail");
  el.classList.remove("hidden");
  el.innerHTML = `
        <div class="tool-detail-header">
            <span style="font-size:24px">${esc(t.emoji)}</span>
            <span style="font-weight:600;font-size:14px">${esc(t.name)}</span>
            <button class="btn-sm" data-action="close-detail" style="margin-left:auto">关闭</button>
        </div>
        <div class="tool-detail-body">${esc(t.desc)}</div>`;
}
