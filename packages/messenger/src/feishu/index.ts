export type {
  FeishuCredentials,
  FeishuDomain,
  FeishuIdType,
  FeishuSendResult,
  FeishuReaction,
} from "./types.js";

export {
  sendMessageFeishu,
  sendCardFeishu,
  sendMarkdownCardFeishu,
  editMessageFeishu,
  updateCardFeishu,
  buildMarkdownCard,
} from "./send.js";

export { addReactionFeishu, removeReactionFeishu, listReactionsFeishu } from "./reactions.js";

export { FeishuEmoji, type FeishuEmojiType } from "./emojis.js";

export {
  normalizeFeishuTarget,
  resolveReceiveIdType,
  formatFeishuTarget,
  detectIdType,
  looksLikeFeishuId,
} from "./targets.js";

export {
  type MentionTarget,
  buildMentionedMessage,
  buildMentionedCardContent,
  formatMentionForText,
  formatMentionForCard,
  formatMentionAllForText,
  formatMentionAllForCard,
} from "./mention.js";

export { createFeishuClient, clearFeishuClientCache } from "./client.js";
