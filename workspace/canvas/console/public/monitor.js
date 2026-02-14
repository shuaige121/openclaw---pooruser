// Token monitoring with better chart styling
let chartDaily, chartModel, chartAgent;

const chartColors = {
  cyan: "rgba(79,195,247,1)",
  green: "rgba(102,187,106,1)",
  gold: "rgba(255,183,77,1)",
  red: "rgba(239,83,80,1)",
  purple: "rgba(171,71,188,1)",
  blue: "rgba(66,165,245,1)",
  orange: "rgba(255,112,67,1)",
  cyanAlpha: "rgba(79,195,247,0.15)",
  greenAlpha: "rgba(102,187,106,0.15)",
  goldAlpha: "rgba(255,183,77,0.15)",
};

const chartDefaults = {
  responsive: true,
  plugins: {
    legend: {
      labels: {
        color: "rgba(255,255,255,0.6)",
        font: { family: "Inter", size: 11 },
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 8,
      },
    },
    tooltip: {
      backgroundColor: "rgba(18,18,31,0.95)",
      titleColor: "#e8e8f0",
      bodyColor: "rgba(255,255,255,0.7)",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      titleFont: { family: "Inter", weight: "600" },
      bodyFont: { family: "Inter" },
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} tokens`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "rgba(255,255,255,0.3)", font: { size: 10 } },
      grid: { color: "rgba(255,255,255,0.04)" },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: "rgba(255,255,255,0.3)",
        font: { size: 10 },
        callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
      },
      grid: { color: "rgba(255,255,255,0.04)" },
    },
  },
};

async function initMonitor() {
  let sessions, config;

  // Fetch data with error handling
  try {
    sessions = await API.get("/api/sessions");
    config = await API.get("/api/config");
  } catch (err) {
    console.error("Failed to load monitoring data:", err);
    toast("加载监控数据失败");
    return;
  }

  const byDay = {};
  const byModel = {};
  const byAgent = {};
  const actionList = [];

  sessions.forEach((s) => {
    // Safe date parsing
    let day;
    try {
      day = new Date(s.updatedAt).toISOString().slice(0, 10);
    } catch (err) {
      console.error("Invalid date:", s.updatedAt);
      return;
    }

    if (!byDay[day]) {
      byDay[day] = { input: 0, output: 0, total: 0 };
    }
    byDay[day].input += s.inputTokens;
    byDay[day].output += s.outputTokens;
    byDay[day].total += s.totalTokens;

    const model = s.model || "unknown";
    if (!byModel[model]) {
      byModel[model] = 0;
    }
    byModel[model] += s.totalTokens;

    if (!byAgent[s.agentId]) {
      byAgent[s.agentId] = 0;
    }
    byAgent[s.agentId] += s.totalTokens;

    if (s.totalTokens > 0) {
      actionList.push({
        label: s.label || s.key,
        tokens: s.totalTokens,
        model: s.model,
        agent: s.agentId,
        date: day,
      });
    }
  });

  const days = Object.keys(byDay).toSorted();
  const last30 = days.slice(-30);

  // Destroy old chart if exists
  if (chartDaily) {
    chartDaily.destroy();
    chartDaily = null;
  }

  // Daily trend
  const ctxD = document.getElementById("chart-daily").getContext("2d");
  chartDaily = new Chart(ctxD, {
    type: "line",
    data: {
      labels: last30.map((d) => d.slice(5)),
      datasets: [
        {
          label: "Input",
          data: last30.map((d) => byDay[d].input),
          borderColor: chartColors.cyan,
          backgroundColor: chartColors.cyanAlpha,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: "Output",
          data: last30.map((d) => byDay[d].output),
          borderColor: chartColors.green,
          backgroundColor: chartColors.greenAlpha,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: "Total",
          data: last30.map((d) => byDay[d].total),
          borderColor: chartColors.gold,
          backgroundColor: chartColors.goldAlpha,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
      ],
    },
    options: { ...chartDefaults, maintainAspectRatio: false },
  });

  // Destroy old chart if exists
  if (chartModel) {
    chartModel.destroy();
    chartModel = null;
  }

  // Model distribution
  const ctxM = document.getElementById("chart-model").getContext("2d");
  const modelNames = Object.keys(byModel);
  const doughnutColors = [
    chartColors.cyan,
    chartColors.green,
    chartColors.gold,
    chartColors.purple,
    chartColors.orange,
    chartColors.blue,
    chartColors.red,
  ];
  chartModel = new Chart(ctxM, {
    type: "doughnut",
    data: {
      labels: modelNames.map((m) => m.split("/").pop()),
      datasets: [
        {
          data: modelNames.map((m) => byModel[m]),
          backgroundColor: doughnutColors.slice(0, modelNames.length),
          borderWidth: 0,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: chartDefaults.plugins.legend,
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : "0.0";
              return `${ctx.label}: ${ctx.raw.toLocaleString()} tokens (${percentage}%)`;
            },
          },
        },
      },
    },
  });

  // Destroy old chart if exists
  if (chartAgent) {
    chartAgent.destroy();
    chartAgent = null;
  }

  // Agent bar chart
  const ctxA = document.getElementById("chart-agent").getContext("2d");
  const agentNames = Object.keys(byAgent);
  chartAgent = new Chart(ctxA, {
    type: "bar",
    data: {
      labels: agentNames,
      datasets: [
        {
          label: "Tokens",
          data: agentNames.map((a) => byAgent[a]),
          backgroundColor: agentNames.map(
            (_, i) => doughnutColors[i % doughnutColors.length] + "99",
          ),
          borderColor: agentNames.map((_, i) => doughnutColors[i % doughnutColors.length]),
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { ...chartDefaults.plugins, legend: { display: false } },
    },
  });

  // Top actions
  actionList.sort((a, b) => b.tokens - a.tokens);
  const top20 = actionList.slice(0, 20);
  document.getElementById("top-actions").innerHTML = `<table>
    <tr><th>动作/会话</th><th>模型</th><th>Tokens</th><th>日期</th></tr>
    ${top20
      .map(
        (a) => `<tr>
      <td>${escMon(truncate(a.label, 40))}</td>
      <td><span style="color:var(--accent-cyan)">${escMon((a.model || "").split("/").pop())}</span></td>
      <td style="font-variant-numeric:tabular-nums">${a.tokens.toLocaleString()}</td>
      <td style="color:var(--text-muted)">${a.date.slice(5)}</td>
    </tr>`,
      )
      .join("")}
  </table>`;

  // Model config
  const defaults = (config.agents && config.agents.defaults) || {};
  const modelKeys = Object.keys(defaults.models || {});
  const primaryModelId = (defaults.model && defaults.model.primary) || "";
  document.getElementById("model-config").innerHTML = `<table>
    <tr><th>模型</th><th>Provider</th><th>已用 Tokens</th><th>主力</th><th>最大上下文</th><th></th></tr>
    ${modelKeys
      .map((key) => {
        const shortName = key.split("/").pop();
        const provider = key.split("/")[0];
        const isPrimary = key === primaryModelId;
        const used = byModel[key] || 0;
        const entry = defaults.models[key] || {};
        return `<tr>
        <td style="font-weight:500">${escMon(shortName)}</td>
        <td style="color:var(--text-muted)">${escMon(provider)}</td>
        <td style="font-variant-numeric:tabular-nums">${used.toLocaleString()}</td>
        <td>${isPrimary ? '<span style="color:var(--accent-green)">★ 主力</span>' : `<button class="btn-sm" data-model="${escMon(key)}" data-action="set-primary">设为主力</button>`}</td>
        <td><input class="ctx-input" data-model-key="${escMon(key)}" data-field="maxContext" value="${entry.maxContext || ""}" placeholder="400000"></td>
        <td><button class="btn-sm" data-model="${escMon(key)}" data-action="save-model">保存</button></td>
      </tr>`;
      })
      .join("")}
  </table>`;

  // Agent config
  const agentList = (config.agents && config.agents.list) || [];
  document.getElementById("agent-config").innerHTML = `<table>
    <tr><th>Agent</th><th>权限</th><th>已用 Tokens</th><th>最大上下文</th><th>每日预算</th><th>工作时间</th><th></th></tr>
    ${agentList
      .map((a) => {
        const profile = (a.tools && a.tools.profile) || "full";
        const used = byAgent[a.id] || 0;
        return `<tr>
        <td style="font-weight:500">${escMon(a.name)}</td>
        <td><span class="info-badge ${profile === "minimal" ? "muted" : "blue"}">${escMon(profile)}</span></td>
        <td style="font-variant-numeric:tabular-nums">${used.toLocaleString()}</td>
        <td><input class="ctx-input" data-id="${escMon(a.id)}" data-field="contextTokens" value="${a.contextTokens || ""}" placeholder="${(defaults.model && defaults.model.contextTokens) || 400000}"></td>
        <td><input class="budget-input" data-id="${escMon(a.id)}" data-field="dailyBudget" value="${a.dailyBudget || ""}" placeholder="无限制"></td>
        <td><input class="hours-input" data-id="${escMon(a.id)}" data-field="workHours" value="${a.workHours || ""}" placeholder="全天"></td>
        <td><button class="btn-sm" data-agent-id="${escMon(a.id)}" data-action="save-agent">保存</button></td>
      </tr>`;
      })
      .join("")}
  </table>`;

  // Delegated click handlers for model/agent config tables
  attachMonitorListeners();
}

async function saveAgentConfig(agentId) {
  let config;
  try {
    config = await API.get("/api/config");
  } catch (err) {
    console.error("Failed to load config:", err);
    toast("加载配置失败");
    return;
  }

  const agent = config.agents.list.find((a) => a.id === agentId);
  if (!agent) {
    return;
  }

  // Find row by iterating inputs instead of CSS selector injection
  const allInputs = document.querySelectorAll("#agent-config input[data-id]");
  let row = null;
  for (const inp of allInputs) {
    if (inp.dataset.id === agentId && inp.dataset.field === "contextTokens") {
      row = inp.closest("tr");
      break;
    }
  }
  if (!row) {
    return;
  }

  row.querySelectorAll("input").forEach((inp) => {
    const field = inp.dataset.field;
    const val = inp.value.trim();
    if (field === "contextTokens" || field === "dailyBudget") {
      if (val) {
        const intVal = parseInt(val, 10);
        if (!isNaN(intVal)) {
          agent[field] = intVal;
        }
      } else {
        delete agent[field];
      }
    } else if (field === "workHours") {
      if (val) {
        agent[field] = val;
      } else {
        delete agent[field];
      }
    }
  });

  try {
    await API.put("/api/config", config);
    toast(`${agent.name} 配置已保存`);
  } catch (err) {
    console.error("Failed to save config:", err);
    toast("保存配置失败");
  }
}

async function setMonitorPrimary(modelKey) {
  try {
    const config = await API.get("/api/config");
    if (!config.agents) {
      config.agents = {};
    }
    if (!config.agents.defaults) {
      config.agents.defaults = {};
    }
    if (!config.agents.defaults.model) {
      config.agents.defaults.model = {};
    }
    config.agents.defaults.model.primary = modelKey;
    await API.put("/api/config", config);
    toast("已设为主力模型");
    initMonitor();
  } catch (err) {
    toast("设置失败", "error");
  }
}

async function saveModelConfig(modelKey) {
  try {
    const config = await API.get("/api/config");
    if (!config.agents || !config.agents.defaults || !config.agents.defaults.models) {
      return;
    }
    const entry = config.agents.defaults.models[modelKey];
    if (!entry) {
      return;
    }

    // Find input by iterating instead of CSS selector injection
    const allInputs = document.querySelectorAll("#model-config input[data-model-key]");
    let inp = null;
    for (const el of allInputs) {
      if (el.dataset.modelKey === modelKey && el.dataset.field === "maxContext") {
        inp = el;
        break;
      }
    }
    if (inp) {
      const val = inp.value.trim();
      if (val) {
        const intVal = parseInt(val, 10);
        if (!isNaN(intVal)) {
          entry.maxContext = intVal;
        }
      } else {
        delete entry.maxContext;
      }
    }

    await API.put("/api/config", config);
    toast("模型配置已保存");
  } catch (err) {
    toast("保存失败", "error");
  }
}

function attachMonitorListeners() {
  const modelCfg = document.getElementById("model-config");
  if (modelCfg) {
    modelCfg.onclick = (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) {
        return;
      }
      const action = btn.dataset.action;
      const modelKey = btn.dataset.model;
      if (action === "set-primary" && modelKey) {
        setMonitorPrimary(modelKey);
      } else if (action === "save-model" && modelKey) {
        saveModelConfig(modelKey);
      }
    };
  }

  const agentCfg = document.getElementById("agent-config");
  if (agentCfg) {
    agentCfg.onclick = (e) => {
      const btn = e.target.closest('[data-action="save-agent"]');
      if (!btn) {
        return;
      }
      const agentId = btn.dataset.agentId;
      if (agentId) {
        saveAgentConfig(agentId);
      }
    };
  }
}

function escMon(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
