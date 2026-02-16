export type {
  TelegramCredentials,
  TelegramSendOpts,
  TelegramSendResult,
  TelegramReactionOpts,
  TelegramDeleteOpts,
  TelegramEditOpts,
  TelegramStickerOpts,
  TelegramPollOpts,
} from "./types.js";

export {
  sendMessageTelegram,
  editMessageTelegram,
  deleteMessageTelegram,
  reactMessageTelegram,
  sendStickerTelegram,
  sendPollTelegram,
  buildInlineKeyboard,
} from "./send.js";

export {
  parseTelegramTarget,
  stripTelegramInternalPrefixes,
  type TelegramTarget,
} from "./targets.js";

export { splitTelegramCaption, TELEGRAM_MAX_CAPTION_LENGTH } from "./caption.js";

export {
  renderTelegramHtmlText,
  markdownToTelegramHtml,
  markdownToTelegramChunks,
  markdownToTelegramHtmlChunks,
  type TelegramFormattedChunk,
} from "./format.js";

export { createTelegramBot, resolveTelegramClientOptions } from "./client.js";
export {
  isRecoverableTelegramNetworkError,
  type TelegramNetworkErrorContext,
} from "./network-errors.js";
export { createTelegramRetryRunner, TELEGRAM_RETRY_DEFAULTS, type RetryRunner } from "./retry.js";
export { buildTelegramThreadParams, type TelegramThreadSpec } from "./thread-params.js";
export { makeProxyFetch } from "./proxy.js";
