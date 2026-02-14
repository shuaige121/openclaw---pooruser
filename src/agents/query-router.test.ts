import { describe, expect, it } from "vitest";
import type { QueryRouterConfig } from "../config/types.router.js";
import {
  classifyQueryComplexity,
  selectModelTier,
  routeQuery,
  type RouteQueryParams,
} from "./query-router.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TIERS: QueryRouterConfig["tiers"] = {
  fast: { models: ["openai/gpt-5.2"], maxComplexity: 0.3 },
  balanced: { models: ["openai/gpt-5.3-codex"], maxComplexity: 0.7 },
  capable: { models: ["anthropic/claude-opus-4-6"] },
};

function makeRouterCfg(overrides?: Partial<QueryRouterConfig>): RouteQueryParams["cfg"] {
  return {
    agents: {
      defaults: {
        router: { enabled: true, tiers: TIERS, ...overrides },
      },
    },
  };
}

function route(message: string, extra?: Partial<RouteQueryParams>) {
  return routeQuery({
    cfg: makeRouterCfg(),
    message,
    currentProvider: "openai",
    currentModel: "gpt-5.3-codex",
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// classifyQueryComplexity
// ---------------------------------------------------------------------------

describe("classifyQueryComplexity", () => {
  it("returns low score for short casual messages", () => {
    const result = classifyQueryComplexity("你好");
    expect(result.score).toBeLessThanOrEqual(0.3);
    expect(result.signals).toEqual([]);
  });

  it("returns low score for simple greetings", () => {
    const result = classifyQueryComplexity("几点了");
    expect(result.score).toBeLessThanOrEqual(0.3);
  });

  it("detects technical keywords in moderate Chinese queries", () => {
    const result = classifyQueryComplexity(
      "帮我写一个 React 组件，实现用户登录表单，需要有邮箱和密码输入框",
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain("technical");
  });

  it("returns high score for complex multi-part coding requests", () => {
    const message = `请帮我实现以下功能：
1. 创建一个 REST API endpoint 用于用户认证
2. 实现 JWT token 生成和验证
3. 添加 middleware 进行权限检查
4. 编写单元测试

\`\`\`typescript
interface AuthConfig {
  secret: string;
  expiresIn: string;
}
\`\`\`

\`\`\`typescript
class AuthService {
  constructor(private config: AuthConfig) {}
}
\`\`\``;
    const result = classifyQueryComplexity(message);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.signals).toContain("technical");
  });

  it("detects media presence", () => {
    const withMedia = classifyQueryComplexity("看看这张图", { hasMedia: true });
    const withoutMedia = classifyQueryComplexity("看看这张图", { hasMedia: false });
    expect(withMedia.score).toBeGreaterThan(withoutMedia.score);
    expect(withMedia.signals).toContain("media");
  });

  it("accounts for conversation depth", () => {
    const shallow = classifyQueryComplexity("继续", { conversationDepth: 1 });
    const deep = classifyQueryComplexity("继续", { conversationDepth: 15 });
    expect(deep.score).toBeGreaterThan(shallow.score);
  });

  it("detects multi-task patterns", () => {
    const multi = classifyQueryComplexity(
      "1. 修复登录 bug\n2. 添加注册功能\n3. 优化数据库查询\n4. 部署到生产环境",
    );
    expect(multi.signals).toEqual(expect.arrayContaining([expect.stringContaining("tasks:")]));
  });

  it("handles empty message", () => {
    const result = classifyQueryComplexity("");
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });

  it("detects code blocks", () => {
    const result = classifyQueryComplexity("帮我修改这个函数\n```js\nfunction foo() {}\n```");
    expect(result.signals).toEqual(expect.arrayContaining([expect.stringContaining("code:")]));
  });
});

// ---------------------------------------------------------------------------
// selectModelTier
// ---------------------------------------------------------------------------

describe("selectModelTier", () => {
  it("selects fast tier for low scores", () => {
    const result = selectModelTier(0.1, TIERS);
    expect(result?.tier).toBe("fast");
  });

  it("selects balanced tier for medium scores", () => {
    const result = selectModelTier(0.5, TIERS);
    expect(result?.tier).toBe("balanced");
  });

  it("selects capable tier for high scores", () => {
    const result = selectModelTier(0.8, TIERS);
    expect(result?.tier).toBe("capable");
  });

  it("selects fast tier at exact boundary", () => {
    const result = selectModelTier(0.3, TIERS);
    expect(result?.tier).toBe("fast");
  });

  it("selects balanced at exact boundary", () => {
    const result = selectModelTier(0.7, TIERS);
    expect(result?.tier).toBe("balanced");
  });

  it("returns null when no tiers configured", () => {
    expect(selectModelTier(0.5, undefined)).toBeNull();
  });

  it("falls through to capable when fast/balanced missing", () => {
    const result = selectModelTier(0.1, {
      capable: { models: ["anthropic/claude-opus-4-6"] },
    });
    expect(result?.tier).toBe("capable");
  });

  it("returns null when tier has no models", () => {
    const result = selectModelTier(0.1, {
      fast: { models: [], maxComplexity: 0.3 },
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// routeQuery
// ---------------------------------------------------------------------------

describe("routeQuery", () => {
  it("routes simple greeting to fast tier", () => {
    const result = route("你好");
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("fast");
    expect(result!.provider).toBe("openai");
    expect(result!.model).toBe("gpt-5.2");
  });

  it("routes complex coding request to capable tier", () => {
    const message = `请帮我实现一个完整的微服务架构：
1. 用户服务 - 处理注册和认证
2. 订单服务 - 管理订单生命周期
3. 支付服务 - 集成第三方支付
4. 网关服务 - 统一入口和路由

\`\`\`typescript
interface ServiceConfig {
  name: string;
  port: number;
  dependencies: string[];
}
\`\`\`

\`\`\`yaml
services:
  - name: user-service
    image: node:20
\`\`\``;
    const result = route(message);
    expect(result).not.toBeNull();
    // Multiple code blocks + tasks + technical keywords → balanced or higher
    expect(["balanced", "capable"]).toContain(result!.tier);
    expect(result!.score).toBeGreaterThan(0.3);
  });

  it("returns null when router is disabled", () => {
    const result = routeQuery({
      cfg: { agents: { defaults: { router: { enabled: false, tiers: TIERS } } } },
      message: "你好",
      currentProvider: "openai",
      currentModel: "gpt-5.3-codex",
    });
    expect(result).toBeNull();
  });

  it("returns null when no router config", () => {
    const result = routeQuery({
      cfg: {},
      message: "你好",
      currentProvider: "openai",
      currentModel: "gpt-5.3-codex",
    });
    expect(result).toBeNull();
  });

  it("applies media override to force capable tier", () => {
    const result = route("看看这个", { hasMedia: true });
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("capable");
    expect(result!.signals).toContain("override:media→capable");
  });

  it("respects mediaAlwaysCapable: false", () => {
    const result = routeQuery({
      cfg: makeRouterCfg({ overrides: { mediaAlwaysCapable: false } }),
      message: "看看",
      hasMedia: true,
      currentProvider: "openai",
      currentModel: "gpt-5.3-codex",
    });
    expect(result).not.toBeNull();
    // Without the override, a short message with media should not necessarily be capable
    expect(result!.signals).not.toContain("override:media→capable");
  });

  it("applies code override to force at least balanced tier", () => {
    const result = route("```js\nx\n```");
    expect(result).not.toBeNull();
    // Code override pushes score above fast threshold
    expect(result!.tier).not.toBe("fast");
  });

  it("includes score and signals in result", () => {
    const result = route("帮我 debug 这个 function");
    expect(result).not.toBeNull();
    expect(typeof result!.score).toBe("number");
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(1);
    expect(Array.isArray(result!.signals)).toBe(true);
  });

  it("caps to balanced tier when token budget reaches warning threshold", () => {
    const result = route(
      `请帮我实现以下系统：
1. 设计认证服务
2. 设计订单服务
3. 设计支付服务
4. 设计网关与重试机制

\`\`\`typescript
interface ServiceConfig {
  name: string;
  dependencies: string[];
}
\`\`\`

\`\`\`yaml
services:
  - auth
  - order
  - payment
\`\`\``,
      {
        cfg: makeRouterCfg({
          tokenBudget: { perSession: 1000, warningThreshold: 0.8, onExceeded: "downgrade" },
        }),
        sessionTotalTokens: 850,
      },
    );
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("balanced");
    expect(result!.signals).toContain("budget:warning");
  });

  it("downgrades to fast tier when token budget is exceeded", () => {
    const result = route("帮我写一份复杂系统设计文档并附代码示例", {
      cfg: makeRouterCfg({
        tokenBudget: { perSession: 1000, warningThreshold: 0.8, onExceeded: "downgrade" },
      }),
      sessionTotalTokens: 1200,
    });
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("fast");
    expect(result!.signals).toContain("budget:exceeded:downgrade");
  });

  it("keeps original tier when onExceeded is warn", () => {
    const result = route(
      `请帮我设计并实现一个高并发消息队列系统，包含：
1. 分区策略
2. 消费者重平衡
3. 幂等处理
4. 死信队列

\`\`\`typescript
type TopicConfig = { partitions: number; replication: number };
\`\`\``,
      {
        cfg: makeRouterCfg({
          tokenBudget: { perSession: 1000, warningThreshold: 0.8, onExceeded: "warn" },
        }),
        sessionTotalTokens: 1500,
      },
    );
    expect(result).not.toBeNull();
    expect(result!.tier).not.toBe("fast");
    expect(result!.signals).toContain("budget:exceeded:warn");
  });

  it("parses provider/model from tier config correctly", () => {
    const result = route("你好");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.model).toBe("gpt-5.2");
  });

  it("downgrades to fast tier when daily token budget is exceeded", () => {
    const result = route("帮我写一份设计文档", {
      cfg: makeRouterCfg({
        tokenBudget: { daily: 5000, warningThreshold: 0.8, onExceeded: "downgrade" },
      }),
      dailyTotalTokens: 6000,
    });
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("fast");
    expect(result!.signals).toContain("budget:exceeded:downgrade");
    expect(result!.signals).toEqual(
      expect.arrayContaining([expect.stringContaining("budget:daily:")]),
    );
  });

  it("caps to balanced when daily budget reaches warning threshold", () => {
    const result = route(
      `请帮我实现以下系统：
1. 用户认证
2. 订单管理
3. 支付集成
4. API 网关

\`\`\`typescript
interface Config { name: string; }
\`\`\`

\`\`\`yaml
services:
  - auth
\`\`\``,
      {
        cfg: makeRouterCfg({
          tokenBudget: { daily: 10000, warningThreshold: 0.8, onExceeded: "downgrade" },
        }),
        dailyTotalTokens: 8500,
      },
    );
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("balanced");
    expect(result!.signals).toContain("budget:warning");
  });

  it("uses the higher ratio when both session and daily budgets are set", () => {
    // Session at 50% (500/1000), daily at 120% (6000/5000) → daily wins → exceeded
    const result = route("hello", {
      cfg: makeRouterCfg({
        tokenBudget: {
          perSession: 1000,
          daily: 5000,
          warningThreshold: 0.8,
          onExceeded: "downgrade",
        },
      }),
      sessionTotalTokens: 500,
      dailyTotalTokens: 6000,
    });
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("fast");
    expect(result!.signals).toContain("budget:exceeded:downgrade");
    expect(result!.signals).toEqual(
      expect.arrayContaining([
        expect.stringContaining("budget:session:"),
        expect.stringContaining("budget:daily:"),
      ]),
    );
  });

  it("falls back when intermediate tier is missing during budget cap", () => {
    // Only fast + capable configured; budget caps to balanced → should fall back to fast
    const tiersNoBalanced: QueryRouterConfig["tiers"] = {
      fast: { models: ["openai/gpt-5.2"], maxComplexity: 0.3 },
      capable: { models: ["anthropic/claude-opus-4-6"] },
    };
    const result = routeQuery({
      cfg: {
        agents: {
          defaults: {
            router: {
              enabled: true,
              tiers: tiersNoBalanced,
              tokenBudget: { perSession: 1000, warningThreshold: 0.8, onExceeded: "downgrade" },
            },
          },
        },
      },
      message: "hello",
      sessionTotalTokens: 850,
      currentProvider: "openai",
      currentModel: "gpt-5.2",
    });
    expect(result).not.toBeNull();
    // Budget warning caps to balanced, but balanced has no models → falls to fast
    expect(result!.tier).toBe("fast");
  });
});
