const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "5mb" }));

// CORS headers for local dev
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3939;
const OPENCLAW_ROOT = path.resolve(__dirname, "..", "..", "..");
const DASHBOARD_FILE = path.join(OPENCLAW_ROOT, "workspace", "canvas", "dashboard.json");

// --- helpers ---
function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error(`readJSON error for ${filePath}:`, e.message);
    return null;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, filePath);
}

function safePath(rel) {
  const abs = path.resolve(OPENCLAW_ROOT, rel);
  if (!abs.startsWith(OPENCLAW_ROOT)) {
    throw new Error("path traversal detected");
  }
  const blocked = [".env", "node_modules/", ".git/"];
  for (const block of blocked) {
    if (abs.includes(block)) {
      throw new Error("access denied");
    }
  }
  return abs;
}

function scanDir(dir, prefix, exts) {
  const results = [];
  if (!fs.existsSync(dir)) {
    return results;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (name === "node_modules" || name === ".git" || name === "dist") {
        continue;
      }

      const fullPath = path.join(dir, name);
      const relPath = prefix ? `${prefix}/${name}` : name;

      if (entry.isDirectory()) {
        results.push(...scanDir(fullPath, relPath, exts));
      } else if (entry.isFile()) {
        const ext = path.extname(name);
        if (exts.includes(ext)) {
          results.push(relPath);
        }
      }
    }
  } catch (e) {
    console.error(`scanDir error for ${dir}:`, e.message);
  }

  return results;
}

// --- Config (openclaw.json) ---
app.get("/api/config", (req, res) => {
  try {
    const configPath = path.join(OPENCLAW_ROOT, "openclaw.json");
    const config = readJSON(configPath) || {};
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/config", (req, res) => {
  try {
    const configPath = path.join(OPENCLAW_ROOT, "openclaw.json");
    writeJSON(configPath, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Dashboard data (identity, contacts, tools, timeline) ---
app.get("/api/dashboard", (req, res) => {
  try {
    const data = readJSON(DASHBOARD_FILE);
    if (!data) {
      return res.json({ identity: {}, contacts: [], tools: [], timeline: [] });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/dashboard", (req, res) => {
  try {
    writeJSON(DASHBOARD_FILE, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Cron (cron/jobs.json) ---
app.get("/api/cron", (req, res) => {
  try {
    const cronPath = path.join(OPENCLAW_ROOT, "cron", "jobs.json");
    const data = readJSON(cronPath);
    // Handle both {version, jobs:[]} and plain [] formats
    const jobs = Array.isArray(data) ? data : data && data.jobs ? data.jobs : [];
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/cron", (req, res) => {
  try {
    const cronPath = path.join(OPENCLAW_ROOT, "cron", "jobs.json");
    // Preserve {version, jobs} wrapper if original file used it
    const existing = readJSON(cronPath);
    const data =
      existing && !Array.isArray(existing) && existing.version !== undefined
        ? { version: existing.version, jobs: req.body }
        : req.body;
    writeJSON(cronPath, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Sessions / Token stats ---
app.get("/api/sessions", (req, res) => {
  try {
    const stats = [];
    const agentsDir = path.join(OPENCLAW_ROOT, "agents");
    if (!fs.existsSync(agentsDir)) {
      return res.json([]);
    }

    const agents = fs.readdirSync(agentsDir);
    for (const agentId of agents) {
      const sessFile = path.join(agentsDir, agentId, "sessions", "sessions.json");
      if (!fs.existsSync(sessFile)) {
        continue;
      }

      const sessions = readJSON(sessFile);
      if (!sessions) {
        continue;
      }

      for (const [key, session] of Object.entries(sessions)) {
        if (!session.updatedAt) {
          continue;
        }
        stats.push({
          key,
          agentId,
          sessionId: session.sessionId,
          model: session.model || "unknown",
          modelProvider: session.modelProvider || "",
          inputTokens: session.inputTokens || 0,
          outputTokens: session.outputTokens || 0,
          totalTokens: session.totalTokens || 0,
          contextTokens: session.contextTokens || 0,
          updatedAt: session.updatedAt,
          label: session.label || "",
          chatType: session.chatType || "",
          channel: session.lastChannel || "",
        });
      }
    }
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- File read/write ---
app.get("/api/file", (req, res) => {
  try {
    const filePath = safePath(req.query.path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "not found" });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ path: req.query.path, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/file", (req, res) => {
  try {
    const filePath = safePath(req.body.path);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, req.body.content, "utf-8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- File list (workspace md/json files) ---
app.get("/api/files", (req, res) => {
  try {
    const files = [];

    const wsDir = path.join(OPENCLAW_ROOT, "workspace");
    files.push(...scanDir(wsDir, "workspace", [".md", ".json"]));

    const ownerDir = path.join(OPENCLAW_ROOT, "workspace-owner");
    files.push(...scanDir(ownerDir, "workspace-owner", [".md", ".json"]));

    const configPath = path.join(OPENCLAW_ROOT, "openclaw.json");
    if (fs.existsSync(configPath)) {
      files.push("openclaw.json");
    }

    const cronPath = path.join(OPENCLAW_ROOT, "cron", "jobs.json");
    if (fs.existsSync(cronPath)) {
      files.push("cron/jobs.json");
    }

    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.listen(PORT, () => console.log(`OpenClaw Console → http://localhost:${PORT}`));
