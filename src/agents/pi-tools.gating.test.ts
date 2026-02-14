import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import "./test-helpers/fast-coding-tools.js";
import { createOpenClawCodingTools } from "./pi-tools.js";

function hasTool(name: string, cfg: OpenClawConfig, currentMessage: string) {
  const tools = createOpenClawCodingTools({ config: cfg, currentMessage });
  return tools.some((tool) => tool.name === name);
}

describe("tool gating", () => {
  it("filters gated tools when keyword triggers do not match", () => {
    const cfg: OpenClawConfig = {
      tools: {
        gating: {
          enabled: true,
          rules: [{ tools: ["cron"], triggers: ["cron", "schedule"] }],
        },
      },
    };
    expect(hasTool("cron", cfg, "just saying hello")).toBe(false);
  });

  it("keeps gated tools when keyword trigger matches", () => {
    const cfg: OpenClawConfig = {
      tools: {
        gating: {
          enabled: true,
          rules: [{ tools: ["cron"], triggers: ["cron", "schedule"] }],
        },
      },
    };
    expect(hasTool("cron", cfg, "please cron list jobs")).toBe(true);
  });

  it("supports prefix trigger mode from agents.defaults.tools.gating", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          tools: {
            gating: {
              enabled: true,
              rules: [{ tools: ["cron"], triggers: ["cron"], triggerMode: "prefix" }],
            },
          },
        },
      },
    };
    expect(hasTool("cron", cfg, "cron list")).toBe(true);
    expect(hasTool("cron", cfg, "please cron list")).toBe(false);
  });

  it("passes through all tools when gating is disabled", () => {
    const cfg: OpenClawConfig = {
      tools: {
        gating: {
          enabled: false,
          rules: [{ tools: ["cron"], triggers: ["cron"] }],
        },
      },
    };
    expect(hasTool("cron", cfg, "just saying hello")).toBe(true);
  });

  it("passes through all tools when message is empty", () => {
    const cfg: OpenClawConfig = {
      tools: {
        gating: {
          enabled: true,
          rules: [{ tools: ["cron"], triggers: ["cron"] }],
        },
      },
    };
    expect(hasTool("cron", cfg, "")).toBe(true);
  });

  it("applies multiple rules independently", () => {
    const cfg: OpenClawConfig = {
      tools: {
        gating: {
          enabled: true,
          rules: [
            { tools: ["cron"], triggers: ["cron", "schedule"] },
            { tools: ["exec"], triggers: ["run", "execute"] },
          ],
        },
      },
    };
    // "cron" trigger matches first rule → cron visible, exec still gated
    expect(hasTool("cron", cfg, "cron list")).toBe(true);
    expect(hasTool("exec", cfg, "cron list")).toBe(false);
    // "run" trigger matches second rule → exec visible, cron still gated
    expect(hasTool("exec", cfg, "run my script")).toBe(true);
    expect(hasTool("cron", cfg, "run my script")).toBe(false);
    // Both triggers match → both visible
    expect(hasTool("cron", cfg, "cron run now")).toBe(true);
    expect(hasTool("exec", cfg, "cron run now")).toBe(true);
  });

  it("reads gating config from top-level tools.gating", () => {
    const cfg: OpenClawConfig = {
      tools: {
        gating: {
          enabled: true,
          rules: [{ tools: ["cron"], triggers: ["cron"] }],
        },
      },
    };
    expect(hasTool("cron", cfg, "hello")).toBe(false);
    expect(hasTool("cron", cfg, "cron list")).toBe(true);
  });
});
