import type { QueryRouterConfig, QueryRouterTierConfig } from "../config/types.router.js";
import { parseModelRef, type ModelRef } from "./model-selection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplexityResult = {
  /** Overall complexity score in [0, 1]. */
  score: number;
  /** Human-readable signal labels that contributed to the score. */
  signals: string[];
};

export type TierName = "fast" | "balanced" | "capable";

export type RouteResult = {
  provider: string;
  model: string;
  tier: TierName;
  score: number;
  signals: string[];
  /** Tool allowlist from the selected tier (undefined = no restriction). */
  toolAllow?: string[];
  /** Tool denylist from the selected tier (undefined = no restriction). */
  toolDeny?: string[];
};

export type RouteQueryParams = {
  cfg: { agents?: { defaults?: { router?: QueryRouterConfig } } };
  message: string;
  hasMedia?: boolean;
  conversationDepth?: number;
  /** Approximate cumulative tokens used in this session. */
  sessionTotalTokens?: number;
  /**
   * Approximate cumulative tokens used today.
   * Caller may provide a lightweight estimate when exact global accounting is unavailable.
   */
  dailyTotalTokens?: number;
  currentProvider: string;
  currentModel: string;
};

// ---------------------------------------------------------------------------
// Signal helpers
// ---------------------------------------------------------------------------

const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]+`/g;

const TECHNICAL_KEYWORDS = new Set([
  // English
  "function",
  "class",
  "interface",
  "module",
  "import",
  "export",
  "async",
  "await",
  "promise",
  "callback",
  "api",
  "endpoint",
  "database",
  "query",
  "schema",
  "migration",
  "deploy",
  "docker",
  "kubernetes",
  "debug",
  "refactor",
  "optimize",
  "algorithm",
  "regex",
  "typescript",
  "javascript",
  "python",
  "rust",
  "golang",
  "component",
  "hook",
  "middleware",
  "architecture",
  "implement",
  "compile",
  "runtime",
  "generic",
  "template",
  "inheritance",
  "polymorphism",
  "concurrency",
  "mutex",
  "thread",
  "websocket",
  "graphql",
  "grpc",
  "oauth",
  "jwt",
  "encryption",
  "hash",
  // 中文
  "函数",
  "接口",
  "组件",
  "模块",
  "部署",
  "数据库",
  "算法",
  "重构",
  "优化",
  "调试",
  "架构",
  "实现",
  "编译",
  "泛型",
  "继承",
  "并发",
  "线程",
  "加密",
]);

const MULTI_TASK_RE = /(?:^|\n)\s*(?:\d+[.)、]|[-*•])\s+\S/g;

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Signal scoring functions
// ---------------------------------------------------------------------------

function scoreMessageLength(message: string): number {
  const len = message.length;
  if (len < 50) {
    return 0;
  }
  if (len <= 500) {
    return (len - 50) / 450;
  }
  return 1;
}

function scoreCodeBlocks(message: string): { score: number; count: number } {
  const fenced = message.match(CODE_BLOCK_RE);
  const inline = message.match(INLINE_CODE_RE);
  const fencedCount = fenced?.length ?? 0;
  const inlineCount = inline?.length ?? 0;
  if (fencedCount === 0 && inlineCount === 0) {
    return { score: 0, count: 0 };
  }
  if (fencedCount === 1 && inlineCount <= 2) {
    return { score: 0.5, count: fencedCount };
  }
  if (fencedCount >= 2 || (fencedCount === 1 && inlineCount > 2)) {
    return { score: 1, count: fencedCount + inlineCount };
  }
  // Only inline code
  if (inlineCount <= 2) {
    return { score: 0.3, count: inlineCount };
  }
  return { score: 0.6, count: inlineCount };
}

function scoreMedia(hasMedia: boolean): number {
  return hasMedia ? 1 : 0;
}

/** CJK keyword range check for substring matching (Chinese/Japanese/Korean lack word boundaries). */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function scoreTechnicalKeywords(message: string): number {
  const lower = message.toLowerCase();
  let hits = 0;

  for (const kw of TECHNICAL_KEYWORDS) {
    if (CJK_RE.test(kw)) {
      // CJK keywords: use substring match (no word boundaries in CJK text)
      if (lower.includes(kw)) {
        hits++;
      }
    } else {
      // Latin keywords: match as whole words
      const re = new RegExp(`\\b${kw}\\b`, "i");
      if (re.test(lower)) {
        hits++;
      }
    }
  }

  if (hits === 0) {
    return 0;
  }
  if (hits <= 2) {
    return 0.4;
  }
  if (hits <= 5) {
    return 0.7;
  }
  return 1;
}

function scoreMultiTask(message: string): { score: number; count: number } {
  const matches = message.match(MULTI_TASK_RE);
  const count = matches?.length ?? 0;
  if (count <= 1) {
    return { score: 0, count };
  }
  if (count <= 3) {
    return { score: 0.5, count };
  }
  return { score: 1, count };
}

function scoreConversationDepth(depth: number): number {
  if (depth <= 1) {
    return 0;
  }
  if (depth <= 10) {
    return (depth - 1) / 9;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

const SIGNAL_WEIGHTS = {
  messageLength: 0.2,
  codeBlocks: 0.25,
  media: 0.15,
  technicalKeywords: 0.15,
  multiTask: 0.1,
  conversationDepth: 0.15,
} as const;

export function classifyQueryComplexity(
  message: string,
  options?: { hasMedia?: boolean; conversationDepth?: number },
): ComplexityResult {
  const hasMedia = options?.hasMedia ?? false;
  const depth = options?.conversationDepth ?? 1;

  const signals: string[] = [];
  let weightedSum = 0;

  // 1. Message length
  const lenScore = scoreMessageLength(message);
  weightedSum += lenScore * SIGNAL_WEIGHTS.messageLength;
  if (lenScore > 0) {
    signals.push(`length:${message.length}`);
  }

  // 2. Code blocks
  const code = scoreCodeBlocks(message);
  weightedSum += code.score * SIGNAL_WEIGHTS.codeBlocks;
  if (code.score > 0) {
    signals.push(`code:${code.count}`);
  }

  // 3. Media
  const mediaScore = scoreMedia(hasMedia);
  weightedSum += mediaScore * SIGNAL_WEIGHTS.media;
  if (mediaScore > 0) {
    signals.push("media");
  }

  // 4. Technical keywords
  const techScore = scoreTechnicalKeywords(message);
  weightedSum += techScore * SIGNAL_WEIGHTS.technicalKeywords;
  if (techScore > 0) {
    signals.push("technical");
  }

  // 5. Multi-task
  const multi = scoreMultiTask(message);
  weightedSum += multi.score * SIGNAL_WEIGHTS.multiTask;
  if (multi.score > 0) {
    signals.push(`tasks:${multi.count}`);
  }

  // 6. Conversation depth
  const depthScore = scoreConversationDepth(depth);
  weightedSum += depthScore * SIGNAL_WEIGHTS.conversationDepth;
  if (depthScore > 0) {
    signals.push(`depth:${depth}`);
  }

  return { score: clamp01(weightedSum), signals };
}

// ---------------------------------------------------------------------------
// Tier selector
// ---------------------------------------------------------------------------

export function selectModelTier(
  score: number,
  tiers?: QueryRouterConfig["tiers"],
): { tier: TierName; tierCfg: QueryRouterTierConfig } | null {
  if (!tiers) {
    return null;
  }

  const { fast, balanced, capable } = tiers;

  if (fast?.models?.length && fast.maxComplexity !== undefined && score <= fast.maxComplexity) {
    return { tier: "fast", tierCfg: fast };
  }
  if (
    balanced?.models?.length &&
    balanced.maxComplexity !== undefined &&
    score <= balanced.maxComplexity
  ) {
    return { tier: "balanced", tierCfg: balanced };
  }
  if (capable?.models?.length) {
    return { tier: "capable", tierCfg: capable };
  }

  return null;
}

const TIER_ORDER: readonly TierName[] = ["fast", "balanced", "capable"] as const;

function getTierConfig(tiers: QueryRouterConfig["tiers"] | undefined, tier: TierName) {
  if (!tiers) {
    return undefined;
  }
  if (tier === "fast") {
    return tiers.fast;
  }
  if (tier === "balanced") {
    return tiers.balanced;
  }
  return tiers.capable;
}

function tierIndex(tier: TierName): number {
  return TIER_ORDER.indexOf(tier);
}

function pickTierAtOrBelowCap(
  tiers: QueryRouterConfig["tiers"] | undefined,
  capTier: TierName,
): { tier: TierName; tierCfg: QueryRouterTierConfig } | null {
  const capIdx = tierIndex(capTier);
  for (let i = capIdx; i >= 0; i -= 1) {
    const tier = TIER_ORDER[i];
    const cfg = getTierConfig(tiers, tier);
    if (cfg?.models?.length) {
      return { tier, tierCfg: cfg };
    }
  }
  return null;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value > 0 ? value : undefined;
}

function normalizeRatio(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function deriveBudgetCap(params: {
  routerCfg: QueryRouterConfig;
  sessionTotalTokens?: number;
  dailyTotalTokens?: number;
}): { capTier?: TierName; signals: string[] } {
  const budget = params.routerCfg.tokenBudget;
  if (!budget) {
    return { signals: [] };
  }

  const signals: string[] = [];
  const warningThreshold = normalizeRatio(budget.warningThreshold) ?? 0.8;
  const perSessionCap = normalizePositiveNumber(budget.perSession);
  const dailyCap = normalizePositiveNumber(budget.daily);
  const sessionUsed = normalizePositiveNumber(params.sessionTotalTokens);
  const dailyUsed = normalizePositiveNumber(params.dailyTotalTokens);

  const sessionRatio =
    perSessionCap !== undefined && sessionUsed !== undefined
      ? sessionUsed / perSessionCap
      : undefined;
  const dailyRatio =
    dailyCap !== undefined && dailyUsed !== undefined ? dailyUsed / dailyCap : undefined;
  const ratios = [sessionRatio, dailyRatio].filter((v): v is number => typeof v === "number");
  if (ratios.length === 0) {
    return { signals };
  }

  if (sessionRatio !== undefined) {
    signals.push(`budget:session:${sessionRatio.toFixed(2)}`);
  }
  if (dailyRatio !== undefined) {
    signals.push(`budget:daily:${dailyRatio.toFixed(2)}`);
  }

  const highestRatio = Math.max(...ratios);
  const onExceeded = budget.onExceeded ?? "downgrade";

  if (highestRatio >= 1) {
    if (onExceeded === "warn") {
      return { signals: [...signals, "budget:exceeded:warn"] };
    }
    // No hard reject path exists in router call sites today; route to cheapest tier.
    return { capTier: "fast", signals: [...signals, `budget:exceeded:${onExceeded}`] };
  }

  if (highestRatio >= warningThreshold && onExceeded !== "warn") {
    return { capTier: "balanced", signals: [...signals, "budget:warning"] };
  }

  if (highestRatio >= warningThreshold && onExceeded === "warn") {
    return { signals: [...signals, "budget:warning:warn"] };
  }

  return { signals };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function pickModel(models: string[], currentProvider: string): ModelRef | null {
  if (models.length === 0) {
    return null;
  }
  // Prefer a model whose provider matches the agent's current provider.
  const providerMatch = models.find((m) => {
    const slash = m.indexOf("/");
    return slash !== -1 && m.slice(0, slash).trim() === currentProvider;
  });
  const raw = providerMatch ?? models[0];
  return parseModelRef(raw, currentProvider);
}

export function routeQuery(params: RouteQueryParams): RouteResult | null {
  const routerCfg = params.cfg.agents?.defaults?.router;
  if (!routerCfg?.enabled) {
    return null;
  }

  const { message, hasMedia, conversationDepth, currentProvider } = params;

  // Classify
  let { score, signals } = classifyQueryComplexity(message, {
    hasMedia,
    conversationDepth,
  });

  // Apply overrides
  const overrides = routerCfg.overrides;
  const mediaAlwaysCapable = overrides?.mediaAlwaysCapable !== false; // default true
  const codeAlwaysBalanced = overrides?.codeAlwaysBalanced !== false; // default true

  if (mediaAlwaysCapable && hasMedia) {
    score = Math.max(score, 0.71); // push above balanced threshold
    if (!signals.includes("override:media→capable")) {
      signals = [...signals, "override:media→capable"];
    }
  }

  if (codeAlwaysBalanced) {
    const hasCode = CODE_BLOCK_RE.test(message);
    // Reset regex lastIndex since we use global flag
    CODE_BLOCK_RE.lastIndex = 0;
    if (hasCode && score < 0.31) {
      score = 0.31; // push above fast threshold
      signals = [...signals, "override:code→balanced"];
    }
  }

  // Select tier
  const selection = selectModelTier(score, routerCfg.tiers);
  if (!selection) {
    return null;
  }

  const budget = deriveBudgetCap({
    routerCfg,
    sessionTotalTokens: params.sessionTotalTokens,
    dailyTotalTokens: params.dailyTotalTokens,
  });
  if (budget.signals.length > 0) {
    signals = [...signals, ...budget.signals];
  }
  const cappedSelection =
    budget.capTier && tierIndex(selection.tier) > tierIndex(budget.capTier)
      ? (pickTierAtOrBelowCap(routerCfg.tiers, budget.capTier) ?? selection)
      : selection;

  const ref = pickModel(cappedSelection.tierCfg.models, currentProvider);
  if (!ref) {
    return null;
  }

  return {
    provider: ref.provider,
    model: ref.model,
    tier: cappedSelection.tier,
    score,
    signals,
    toolAllow: cappedSelection.tierCfg.tools?.allow,
    toolDeny: cappedSelection.tierCfg.tools?.deny,
  };
}
