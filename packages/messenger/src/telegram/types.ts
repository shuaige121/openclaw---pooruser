import type { Bot } from "grammy";
import type { RetryConfig } from "../internal/retry.js";

export type TelegramCredentials = {
  token: string;
  proxy?: { url: string };
  timeoutSeconds?: number;
  linkPreview?: boolean;
  networkErrorRetries?: number;
  retry?: RetryConfig;
};

export type TelegramSendOpts = {
  verbose?: boolean;
  media?: {
    buffer: Buffer;
    contentType?: string;
    fileName?: string;
  };
  api?: Bot["api"];
  retry?: RetryConfig;
  textMode?: "markdown" | "html";
  tableMode?: "off" | "bullets" | "code";
  plainText?: string;
  asVoice?: boolean;
  asVideoNote?: boolean;
  silent?: boolean;
  replyToMessageId?: number;
  quoteText?: string;
  messageThreadId?: number;
  buttons?: Array<Array<{ text: string; callback_data: string }>>;
  logger?: (message: string) => void;
};

export type TelegramSendResult = {
  messageId: string;
  chatId: string;
};

export type TelegramReactionOpts = {
  api?: Bot["api"];
  remove?: boolean;
  verbose?: boolean;
  retry?: RetryConfig;
  logger?: (message: string) => void;
};

export type TelegramDeleteOpts = {
  verbose?: boolean;
  api?: Bot["api"];
  retry?: RetryConfig;
  logger?: (message: string) => void;
};

export type TelegramEditOpts = {
  verbose?: boolean;
  api?: Bot["api"];
  retry?: RetryConfig;
  textMode?: "markdown" | "html";
  tableMode?: "off" | "bullets" | "code";
  buttons?: Array<Array<{ text: string; callback_data: string }>>;
  logger?: (message: string) => void;
};

export type TelegramStickerOpts = {
  verbose?: boolean;
  api?: Bot["api"];
  retry?: RetryConfig;
  replyToMessageId?: number;
  messageThreadId?: number;
  logger?: (message: string) => void;
};

export type TelegramPollOpts = {
  verbose?: boolean;
  api?: Bot["api"];
  retry?: RetryConfig;
  isAnonymous?: boolean;
  allowsMultipleAnswers?: boolean;
  messageThreadId?: number;
  logger?: (message: string) => void;
};
