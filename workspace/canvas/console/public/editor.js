// File editor with CodeMirror
let cm = null;
let currentFile = null;
let isDirty = false;

async function initEditor() {
  try {
    const files = await API.get("/api/files");
    renderFileList(files);
  } catch (e) {
    console.error("Failed to load file list:", e);
    document.getElementById("file-list").innerHTML = '<div class="error">加载文件列表失败</div>';
  }

  // Delegated click listener on file list
  document.getElementById("file-list").onclick = (e) => {
    const fileItem = e.target.closest(".file-item");
    if (fileItem) {
      const path = fileItem.dataset.path;
      loadFile(path);
    }
  };

  // Save button
  document.getElementById("btn-save").onclick = saveFile;

  // Ctrl+S keyboard shortcut - only intercept when editor panel is active
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      if (document.getElementById("panel-editor").classList.contains("active")) {
        e.preventDefault();
        saveFile();
      }
    }
  });
}

function renderFileList(files) {
  const listEl = document.getElementById("file-list");
  listEl.innerHTML = files
    .map((f) => `<div class="file-item" data-path="${escEditor(f)}">${escEditor(f)}</div>`)
    .join("");
}

async function loadFile(filePath) {
  // Check for unsaved changes
  if (isDirty) {
    if (!confirm("当前文件未保存，确认切换？")) {
      return;
    }
  }

  try {
    const data = await API.get("/api/file?path=" + encodeURIComponent(filePath));
    currentFile = filePath;

    document.getElementById("editor-filename").textContent = filePath;
    document.getElementById("btn-save").disabled = false;

    // Highlight active file
    document.querySelectorAll(".file-item").forEach((el) => {
      el.classList.remove("active");
      if (el.dataset.path === filePath) {
        el.classList.add("active");
      }
    });

    // Detect mode from extension
    const mode = detectMode(filePath);

    // Init or update CodeMirror
    const wrap = document.getElementById("codemirror-wrap");
    if (cm) {
      cm.setValue(data.content);
      cm.setOption("mode", mode);
    } else {
      wrap.innerHTML = "";
      cm = CodeMirror(wrap, {
        value: data.content,
        mode: mode,
        theme: "material-darker",
        lineNumbers: true,
        lineWrapping: true,
        readOnly: false,
      });

      // Listen for changes
      cm.on("change", () => {
        isDirty = true;
      });
    }

    isDirty = false;
  } catch (e) {
    console.error("Failed to load file:", e);
  }
}

async function saveFile() {
  if (!currentFile || !cm) {
    return;
  }

  try {
    await API.put("/api/file", { path: currentFile, content: cm.getValue() });
    toast(currentFile.split("/").pop() + " 已保存", "success");
    isDirty = false;
  } catch (e) {
    console.error("Failed to save file:", e);
  }
}

function detectMode(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();

  // Only include modes that have CDN scripts loaded in index.html
  const modeMap = {
    json: "application/json",
    md: "markdown",
    js: "javascript",
    ts: "javascript",
    jsx: "javascript",
    tsx: "javascript",
    txt: "markdown",
  };

  return modeMap[ext] || "markdown";
}

function escEditor(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
