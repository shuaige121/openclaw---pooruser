import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import "./test-helpers/fast-coding-tools.js";
import { createOpenClawCodingTools } from "./pi-tools.js";

function getToolNames(cfg: OpenClawConfig, currentMessage: string) {
  const tools = createOpenClawCodingTools({ config: cfg, currentMessage });
  return tools.map((tool) => tool.name);
}

function hasTool(name: string, cfg: OpenClawConfig, currentMessage: string) {
  return getToolNames(cfg, currentMessage).includes(name);
}

const BASE_CONFIG: OpenClawConfig = {
  agents: {
    defaults: {
      router: {
        enabled: true,
        tiers: {
          fast: {
            models: ["openai-codex/gpt-5.2"],
            maxComplexity: 0.3,
            tools: { allow: ["message", "tts", "session_status"] },
          },
          balanced: {
            models: ["openai-codex/gpt-5.3-codex"],
            maxComplexity: 0.65,
            tools: {
              allow: [
                "group:messaging",
                "group:web",
                "group:memory",
                "group:fs",
                "image",
                "tts",
                "sessions_list",
                "sessions_history",
                "sessions_send",
                "session_status",
              ],
            },
          },
          capable: {
            models: ["google-antigravity/claude-opus-4-6-thinking"],
          },
        },
      },
    },
  },
};

describe("router tool filter", () => {
  it("limits tools for simple messages (fast tier)", () => {
    const tools = getToolNames(BASE_CONFIG, "\u4f60\u597d");
    // Fast tier should only have message, tts, session_status
    expect(tools).toContain("message");
    expect(tools).toContain("session_status");
    expect(tools).not.toContain("exec");
    expect(tools).not.toContain("cron");
    expect(tools).not.toContain("web_search");
    expect(tools).not.toContain("browser");
  });

  it("includes all tools for complex messages (capable tier)", () => {
    // Build a message with enough signals to push score > 0.65:
    // long text + multiple code blocks + many technical keywords + multi-task
    const capableMsg = [
      "Please implement a complete microservice with these requirements:",
      "1. Design a GraphQL API with OAuth authentication",
      "2. Set up Docker containers with Kubernetes deployment",
      "3. Implement WebSocket real-time notifications with concurrency",
      "4. Database migration with indexing and optimization",
      "5. Comprehensive testing: unit, integration, and e2e",
      "6. CI/CD pipeline with deploy and monitoring",
      "```typescript",
      'import { Module } from "@nestjs/common";',
      "@Module({ imports: [] })",
      "export class AppModule {}",
      "```",
      "```python",
      "from fastapi import FastAPI",
      "app = FastAPI()",
      "```",
    ].join("\n");
    // Score ~0.70 -> capable tier -> no restriction
    expect(hasTool("exec", BASE_CONFIG, capableMsg)).toBe(true);
    expect(hasTool("cron", BASE_CONFIG, capableMsg)).toBe(true);
    expect(hasTool("browser", BASE_CONFIG, capableMsg)).toBe(true);
  });

  it("does not filter when router is disabled", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          router: { enabled: false, tiers: BASE_CONFIG.agents!.defaults!.router!.tiers },
        },
      },
    };
    // All tools should pass through
    expect(hasTool("exec", cfg, "\u4f60\u597d")).toBe(true);
    expect(hasTool("cron", cfg, "\u4f60\u597d")).toBe(true);
  });

  it("does not filter when tier has no tools config", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          router: {
            enabled: true,
            tiers: {
              fast: { models: ["m"], maxComplexity: 0.3 },
              balanced: { models: ["m"], maxComplexity: 0.65 },
              capable: { models: ["m"] },
            },
          },
        },
      },
    };
    expect(hasTool("exec", cfg, "\u4f60\u597d")).toBe(true);
  });

  it("supports deny list in tier tools config", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          router: {
            enabled: true,
            tiers: {
              fast: {
                models: ["m"],
                maxComplexity: 0.3,
                tools: { deny: ["cron", "gateway", "browser", "canvas"] },
              },
              balanced: { models: ["m"], maxComplexity: 0.65 },
              capable: { models: ["m"] },
            },
          },
        },
      },
    };
    expect(hasTool("cron", cfg, "hi")).toBe(false);
    expect(hasTool("gateway", cfg, "hi")).toBe(false);
    // Other tools should still be present
    expect(hasTool("exec", cfg, "hi")).toBe(true);
  });

  it("supports tool groups in tier allow list", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          router: {
            enabled: true,
            tiers: {
              fast: {
                models: ["m"],
                maxComplexity: 0.3,
                tools: { allow: ["group:messaging"] },
              },
              balanced: { models: ["m"], maxComplexity: 0.65 },
              capable: { models: ["m"] },
            },
          },
        },
      },
    };
    expect(hasTool("message", cfg, "hi")).toBe(true);
    expect(hasTool("exec", cfg, "hi")).toBe(false);
    expect(hasTool("web_search", cfg, "hi")).toBe(false);
  });
});
