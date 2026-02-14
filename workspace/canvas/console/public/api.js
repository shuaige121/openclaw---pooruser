// API helper
const API = {
  async get(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
      return await r.json();
    } catch (e) {
      toast(e.message, "error");
      throw e;
    }
  },
  async put(url, body) {
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
      return await r.json();
    } catch (e) {
      toast(e.message, "error");
      throw e;
    }
  },
};

// Toast with type support: 'success' (default, green) or 'error' (red)
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = type === "error" ? "show error" : "show";
  setTimeout(() => {
    el.className = "";
  }, 3000);
}
