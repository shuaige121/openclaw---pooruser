export type QueryRouterTierConfig = {
  /** Model candidates in provider/model format. */
  models: string[];
  /** Route to this tier if complexity score <= this value (range: 0..1, not needed for last tier). */
  maxComplexity?: number;
  /**
   * Tool allow/deny filter applied when this tier is selected.
   * Supports tool names and group references (e.g. "group:web").
   * When omitted, all tools pass through (no restriction).
   */
  tools?: {
    allow?: string[];
    deny?: string[];
  };
};

export type QueryRouterConfig = {
  /** Enable the intelligent query router (default: false). */
  enabled?: boolean;
  /** Model tiers ordered by capability: fast < balanced < capable. */
  tiers?: {
    fast?: QueryRouterTierConfig;
    balanced?: QueryRouterTierConfig;
    capable?: QueryRouterTierConfig;
  };
  /** Token budget caps for cost control. */
  tokenBudget?: {
    /** Daily token cap. */
    daily?: number;
    /** Per-session token cap. */
    perSession?: number;
    /** Per-request token cap (approximate, based on input length). */
    perRequest?: number;
    /** Warning threshold as 0-1 ratio (default: 0.8). */
    warningThreshold?: number;
    /** Action when budget is exceeded. */
    onExceeded?: "downgrade" | "block" | "warn";
  };
  /** Override rules for specific content types. */
  overrides?: {
    /** Always route messages with media/images to capable tier (default: true). */
    mediaAlwaysCapable?: boolean;
    /** Always route messages with code blocks to balanced+ tier (default: true). */
    codeAlwaysBalanced?: boolean;
  };
};
