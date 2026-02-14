// Unified app initialization
document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");
  const loaded = {};

  const validTabs = new Set(["overview", "monitor", "cron", "editor"]);

  function switchTab(target) {
    if (!validTabs.has(target)) {
      target = "overview";
    }

    tabs.forEach((t) => t.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));

    const tabBtn = document.querySelector(`.tab[data-panel="${target}"]`);
    const panel = document.getElementById("panel-" + target);
    if (!tabBtn || !panel) {
      target = "overview";
      return switchTab(target);
    }

    tabBtn.classList.add("active");
    panel.classList.add("active");
    location.hash = target;

    // Always re-init data tabs to keep data fresh; only init editor once
    if (target === "editor") {
      if (!loaded[target]) {
        loaded[target] = true;
        initEditor();
      }
    } else {
      loaded[target] = true;
      switch (target) {
        case "overview":
          initOverview();
          break;
        case "monitor":
          initMonitor();
          break;
        case "cron":
          initCron();
          break;
      }
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.panel));
  });

  // URL hash routing
  const hash = location.hash.replace("#", "") || "overview";
  switchTab(hash);

  // Live clock (SGT)
  function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Singapore",
    });
    const el = document.querySelector(".header-sub");
    if (el) {
      el.textContent = `酒酒的控制面板 · SGT ${timeStr}`;
    }
  }
  updateTime();
  setInterval(updateTime, 30000);

  // Modal close
  document.getElementById("modal-close").onclick = () => {
    document.getElementById("node-modal").classList.add("hidden");
  };
  // ESC to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.getElementById("node-modal").classList.add("hidden");
    }
  });

  // Global error handler
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled:", e.reason);
  });
});
