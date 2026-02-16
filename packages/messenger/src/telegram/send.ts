import type {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  ReactionType,
  ReactionTypeEmoji,
} from "@grammyjs/types";
import { Bot, InputFile } from "grammy";
import type {
  TelegramCredentials,
  TelegramSendOpts,
  TelegramSendResult,
  TelegramReactionOpts,
  TelegramDeleteOpts,
  TelegramEditOpts,
  TelegramStickerOpts,
  TelegramPollOpts,
} from "./types.js";
import { formatErrorMessage } from "../internal/errors.js";
import { mediaKindFromMime, isGifMedia, type MediaKind } from "../internal/media.js";
import { resolveVoiceSend } from "../internal/voice.js";
import { splitTelegramCaption } from "./caption.js";
import { resolveTelegramClientOptions } from "./client.js";
import { renderTelegramHtmlText } from "./format.js";
import { isRecoverableTelegramNetworkError } from "./network-errors.js";
import { createTelegramRetryRunner } from "./retry.js";
import { parseTelegramTarget, stripTelegramInternalPrefixes } from "./targets.js";
import { buildTelegramThreadParams } from "./thread-params.js";

const PARSE_ERR_RE = /can't parse entities|parse entities|find end of the entity/i;
const THREAD_NOT_FOUND_RE = /400:\s*Bad Request:\s*message thread not found/i;

function normalizeChatId(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for Telegram sends");
  }

  let normalized = stripTelegramInternalPrefixes(trimmed);

  const m =
    /^https?:\/\/t\.me\/([A-Za-z0-9_]+)$/i.exec(normalized) ??
    /^t\.me\/([A-Za-z0-9_]+)$/i.exec(normalized);
  if (m?.[1]) {
    normalized = `@${m[1]}`;
  }

  if (!normalized) {
    throw new Error("Recipient is required for Telegram sends");
  }
  if (normalized.startsWith("@")) {
    return normalized;
  }
  if (/^-?\d+$/.test(normalized)) {
    return normalized;
  }
  if (/^[A-Za-z0-9_]{5,}$/i.test(normalized)) {
    return `@${normalized}`;
  }
  return normalized;
}

function normalizeMessageId(raw: string | number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      throw new Error("Message id is required for Telegram actions");
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error("Message id is required for Telegram actions");
}

function isTelegramThreadNotFoundError(err: unknown): boolean {
  return THREAD_NOT_FOUND_RE.test(formatErrorMessage(err));
}

function hasMessageThreadIdParam(params?: Record<string, unknown>): boolean {
  if (!params) {
    return false;
  }
  const value = params.message_thread_id;
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return false;
}

function removeMessageThreadIdParam(
  params?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!params || !hasMessageThreadIdParam(params)) {
    return params;
  }
  const next = { ...params };
  delete next.message_thread_id;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildInlineKeyboard(
  buttons?: TelegramSendOpts["buttons"],
): InlineKeyboardMarkup | undefined {
  if (!buttons?.length) {
    return undefined;
  }
  const rows = buttons
    .map((row) =>
      row
        .filter((button) => button?.text && button?.callback_data)
        .map(
          (button): InlineKeyboardButton => ({
            text: button.text,
            callback_data: button.callback_data,
          }),
        ),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) {
    return undefined;
  }
  return { inline_keyboard: rows };
}

function resolveApi(creds: TelegramCredentials, apiOverride?: Bot["api"]): Bot["api"] {
  if (apiOverride) {
    return apiOverride;
  }
  const client = resolveTelegramClientOptions(creds);
  return new Bot(creds.token, client ? { client } : undefined).api;
}

function inferFilename(kind: MediaKind) {
  switch (kind) {
    case "image":
      return "image.jpg";
    case "video":
      return "video.mp4";
    case "audio":
      return "audio.ogg";
    default:
      return "file.bin";
  }
}

export async function sendMessageTelegram(
  creds: TelegramCredentials,
  params: {
    to: string;
    text: string;
  } & TelegramSendOpts,
): Promise<TelegramSendResult> {
  const { to, text } = params;
  const target = parseTelegramTarget(to);
  const chatId = normalizeChatId(target.chatId);
  const api = resolveApi(creds, params.api);
  const replyMarkup = buildInlineKeyboard(params.buttons);

  const messageThreadId =
    params.messageThreadId != null ? params.messageThreadId : target.messageThreadId;
  const threadSpec =
    messageThreadId != null ? { id: messageThreadId, scope: "forum" as const } : undefined;
  const threadIdParams = buildTelegramThreadParams(threadSpec);
  const threadParams: Record<string, unknown> = threadIdParams ? { ...threadIdParams } : {};
  const quoteText = params.quoteText?.trim();
  if (params.replyToMessageId != null) {
    if (quoteText) {
      threadParams.reply_parameters = {
        message_id: Math.trunc(params.replyToMessageId),
        quote: quoteText,
      };
    } else {
      threadParams.reply_to_message_id = Math.trunc(params.replyToMessageId);
    }
  }
  const hasThreadParams = Object.keys(threadParams).length > 0;

  const request = createTelegramRetryRunner({
    retry: params.retry ?? creds.retry,
    verbose: params.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const wrapChatNotFound = (err: unknown) => {
    if (!/400: Bad Request: chat not found/i.test(formatErrorMessage(err))) {
      return err;
    }
    return new Error(
      [
        `Telegram send failed: chat not found (chat_id=${chatId}).`,
        "Likely: bot not started in DM, bot removed from group/channel, group migrated (new -100… id), or wrong bot token.",
        `Input was: ${JSON.stringify(to)}.`,
      ].join(" "),
    );
  };

  const sendWithThreadFallback = async <T>(
    fp: Record<string, unknown> | undefined,
    label: string,
    attempt: (
      effectiveParams: Record<string, unknown> | undefined,
      effectiveLabel: string,
    ) => Promise<T>,
  ): Promise<T> => {
    try {
      return await attempt(fp, label);
    } catch (err) {
      if (!hasMessageThreadIdParam(fp) || !isTelegramThreadNotFoundError(err)) {
        throw err;
      }
      if (params.verbose) {
        console.warn(
          `telegram ${label} failed with message_thread_id, retrying without thread: ${formatErrorMessage(err)}`,
        );
      }
      const retriedParams = removeMessageThreadIdParam(fp);
      return await attempt(retriedParams, `${label}-threadless`);
    }
  };

  const textMode = params.textMode ?? "markdown";
  const tableMode = params.tableMode;
  const renderHtmlText = (value: string) => renderTelegramHtmlText(value, { textMode, tableMode });

  const linkPreviewEnabled = creds.linkPreview ?? true;
  const linkPreviewOptions = linkPreviewEnabled ? undefined : { is_disabled: true };

  const sendTelegramText = async (
    rawText: string,
    extraParams?: Record<string, unknown>,
    fallbackText?: string,
  ) => {
    return await sendWithThreadFallback(extraParams, "message", async (effectiveParams, label) => {
      const htmlText = renderHtmlText(rawText);
      const baseParams = effectiveParams ? { ...effectiveParams } : {};
      if (linkPreviewOptions) {
        baseParams.link_preview_options = linkPreviewOptions;
      }
      const hasBaseParams = Object.keys(baseParams).length > 0;
      const sendParams = {
        parse_mode: "HTML" as const,
        ...baseParams,
        ...(params.silent === true ? { disable_notification: true } : {}),
      };
      const res = await request(
        () =>
          api.sendMessage(chatId, htmlText, sendParams as Parameters<typeof api.sendMessage>[2]),
        label,
      ).catch(async (err) => {
        const errText = formatErrorMessage(err);
        if (PARSE_ERR_RE.test(errText)) {
          if (params.verbose) {
            console.warn(`telegram HTML parse failed, retrying as plain text: ${errText}`);
          }
          const fallback = fallbackText ?? rawText;
          const plainParams = hasBaseParams
            ? (baseParams as Parameters<typeof api.sendMessage>[2])
            : undefined;
          return await request(
            () =>
              plainParams
                ? api.sendMessage(chatId, fallback, plainParams)
                : api.sendMessage(chatId, fallback),
            `${label}-plain`,
          ).catch((err2) => {
            throw wrapChatNotFound(err2);
          });
        }
        throw wrapChatNotFound(err);
      });
      return res;
    });
  };

  if (params.media) {
    const media = params.media;
    const kind = mediaKindFromMime(media.contentType ?? undefined);
    const isGif = isGifMedia({
      contentType: media.contentType,
      fileName: media.fileName,
    });
    const isVideoNote = kind === "video" && params.asVideoNote === true;
    const fileName = media.fileName ?? (isGif ? "animation.gif" : inferFilename(kind)) ?? "file";
    const file = new InputFile(media.buffer, fileName);
    let caption: string | undefined;
    let followUpText: string | undefined;

    if (isVideoNote) {
      caption = undefined;
      followUpText = text.trim() ? text : undefined;
    } else {
      const split = splitTelegramCaption(text);
      caption = split.caption;
      followUpText = split.followUpText;
    }
    const htmlCaption = caption ? renderHtmlText(caption) : undefined;
    const needsSeparateText = Boolean(followUpText);
    const baseMediaParams = {
      ...(hasThreadParams ? threadParams : {}),
      ...(!needsSeparateText && replyMarkup ? { reply_markup: replyMarkup } : {}),
    };
    const mediaParams = {
      ...(htmlCaption ? { caption: htmlCaption, parse_mode: "HTML" as const } : {}),
      ...baseMediaParams,
      ...(params.silent === true ? { disable_notification: true } : {}),
    };

    let result:
      | Awaited<ReturnType<typeof api.sendPhoto>>
      | Awaited<ReturnType<typeof api.sendVideo>>
      | Awaited<ReturnType<typeof api.sendVideoNote>>
      | Awaited<ReturnType<typeof api.sendAudio>>
      | Awaited<ReturnType<typeof api.sendVoice>>
      | Awaited<ReturnType<typeof api.sendAnimation>>
      | Awaited<ReturnType<typeof api.sendDocument>>;

    if (isGif) {
      result = await sendWithThreadFallback(mediaParams, "animation", async (ep, label) =>
        request(
          () => api.sendAnimation(chatId, file, ep as Parameters<typeof api.sendAnimation>[2]),
          label,
        ).catch((err) => {
          throw wrapChatNotFound(err);
        }),
      );
    } else if (kind === "image") {
      result = await sendWithThreadFallback(mediaParams, "photo", async (ep, label) =>
        request(
          () => api.sendPhoto(chatId, file, ep as Parameters<typeof api.sendPhoto>[2]),
          label,
        ).catch((err) => {
          throw wrapChatNotFound(err);
        }),
      );
    } else if (kind === "video") {
      if (isVideoNote) {
        result = await sendWithThreadFallback(mediaParams, "video_note", async (ep, label) =>
          request(
            () => api.sendVideoNote(chatId, file, ep as Parameters<typeof api.sendVideoNote>[2]),
            label,
          ).catch((err) => {
            throw wrapChatNotFound(err);
          }),
        );
      } else {
        result = await sendWithThreadFallback(mediaParams, "video", async (ep, label) =>
          request(
            () => api.sendVideo(chatId, file, ep as Parameters<typeof api.sendVideo>[2]),
            label,
          ).catch((err) => {
            throw wrapChatNotFound(err);
          }),
        );
      }
    } else if (kind === "audio") {
      const { useVoice } = resolveVoiceSend({
        wantsVoice: params.asVoice === true,
        contentType: media.contentType,
        fileName,
        logFallback: params.verbose ? (m) => console.warn(m) : undefined,
      });
      if (useVoice) {
        result = await sendWithThreadFallback(mediaParams, "voice", async (ep, label) =>
          request(
            () => api.sendVoice(chatId, file, ep as Parameters<typeof api.sendVoice>[2]),
            label,
          ).catch((err) => {
            throw wrapChatNotFound(err);
          }),
        );
      } else {
        result = await sendWithThreadFallback(mediaParams, "audio", async (ep, label) =>
          request(
            () => api.sendAudio(chatId, file, ep as Parameters<typeof api.sendAudio>[2]),
            label,
          ).catch((err) => {
            throw wrapChatNotFound(err);
          }),
        );
      }
    } else {
      result = await sendWithThreadFallback(mediaParams, "document", async (ep, label) =>
        request(
          () => api.sendDocument(chatId, file, ep as Parameters<typeof api.sendDocument>[2]),
          label,
        ).catch((err) => {
          throw wrapChatNotFound(err);
        }),
      );
    }

    const mediaMessageId = String(result?.message_id ?? "unknown");
    const resolvedChatId = String(result?.chat?.id ?? chatId);

    if (needsSeparateText && followUpText) {
      const textParams =
        hasThreadParams || replyMarkup
          ? { ...threadParams, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
          : undefined;
      const textRes = await sendTelegramText(followUpText, textParams);
      return {
        messageId: String(textRes?.message_id ?? mediaMessageId),
        chatId: resolvedChatId,
      };
    }

    return { messageId: mediaMessageId, chatId: resolvedChatId };
  }

  if (!text || !text.trim()) {
    throw new Error("Message must be non-empty for Telegram sends");
  }
  const textParams =
    hasThreadParams || replyMarkup
      ? { ...threadParams, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
      : undefined;
  const res = await sendTelegramText(text, textParams, params.plainText);
  const messageId = String(res?.message_id ?? "unknown");
  return { messageId, chatId: String(res?.chat?.id ?? chatId) };
}

export async function editMessageTelegram(
  creds: TelegramCredentials,
  params: {
    to: string | number;
    messageId: string | number;
    text: string;
  } & TelegramEditOpts,
): Promise<{ ok: true; messageId: string; chatId: string }> {
  const chatId = normalizeChatId(String(params.to));
  const messageId = normalizeMessageId(params.messageId);
  const api = resolveApi(creds, params.api);

  const request = createTelegramRetryRunner({
    retry: params.retry ?? creds.retry,
    verbose: params.verbose,
  });

  const textMode = params.textMode ?? "markdown";
  const tableMode = params.tableMode;
  const htmlText = renderTelegramHtmlText(params.text, { textMode, tableMode });

  const shouldTouchButtons = params.buttons !== undefined;
  const builtKeyboard = shouldTouchButtons ? buildInlineKeyboard(params.buttons) : undefined;
  const replyMarkup = shouldTouchButtons ? (builtKeyboard ?? { inline_keyboard: [] }) : undefined;

  const editParams: Record<string, unknown> = { parse_mode: "HTML" };
  if (replyMarkup !== undefined) {
    editParams.reply_markup = replyMarkup;
  }

  await request(
    () => api.editMessageText(chatId, messageId, htmlText, editParams),
    "editMessage",
  ).catch(async (err) => {
    const errText = formatErrorMessage(err);
    if (PARSE_ERR_RE.test(errText)) {
      if (params.verbose) {
        console.warn(`telegram HTML parse failed, retrying as plain text: ${errText}`);
      }
      const plainParams: Record<string, unknown> = {};
      if (replyMarkup !== undefined) {
        plainParams.reply_markup = replyMarkup;
      }
      return await request(
        () =>
          Object.keys(plainParams).length > 0
            ? api.editMessageText(chatId, messageId, params.text, plainParams)
            : api.editMessageText(chatId, messageId, params.text),
        "editMessage-plain",
      );
    }
    throw err;
  });

  return { ok: true, messageId: String(messageId), chatId };
}

export async function deleteMessageTelegram(
  creds: TelegramCredentials,
  params: {
    to: string | number;
    messageId: string | number;
  } & TelegramDeleteOpts,
): Promise<{ ok: true }> {
  const chatId = normalizeChatId(String(params.to));
  const messageId = normalizeMessageId(params.messageId);
  const api = resolveApi(creds, params.api);

  const request = createTelegramRetryRunner({
    retry: params.retry ?? creds.retry,
    verbose: params.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  await request(() => api.deleteMessage(chatId, messageId), "deleteMessage");
  return { ok: true };
}

export async function reactMessageTelegram(
  creds: TelegramCredentials,
  params: {
    to: string | number;
    messageId: string | number;
    emoji: string;
  } & TelegramReactionOpts,
): Promise<{ ok: true }> {
  const chatId = normalizeChatId(String(params.to));
  const messageId = normalizeMessageId(params.messageId);
  const api = resolveApi(creds, params.api);

  const request = createTelegramRetryRunner({
    retry: params.retry ?? creds.retry,
    verbose: params.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const remove = params.remove === true;
  const trimmedEmoji = params.emoji.trim();
  const reactions: ReactionType[] =
    remove || !trimmedEmoji
      ? []
      : [{ type: "emoji", emoji: trimmedEmoji as ReactionTypeEmoji["emoji"] }];

  if (typeof api.setMessageReaction !== "function") {
    throw new Error("Telegram reactions are unavailable in this bot API.");
  }

  await request(() => api.setMessageReaction(chatId, messageId, reactions), "reaction");
  return { ok: true };
}

export async function sendStickerTelegram(
  creds: TelegramCredentials,
  params: {
    to: string;
    stickerId: string;
  } & TelegramStickerOpts,
): Promise<TelegramSendResult> {
  if (!params.stickerId?.trim()) {
    throw new Error("Telegram sticker file_id is required");
  }

  const target = parseTelegramTarget(params.to);
  const chatId = normalizeChatId(target.chatId);
  const api = resolveApi(creds, params.api);

  const messageThreadId =
    params.messageThreadId != null ? params.messageThreadId : target.messageThreadId;
  const threadSpec =
    messageThreadId != null ? { id: messageThreadId, scope: "forum" as const } : undefined;
  const threadIdParams = buildTelegramThreadParams(threadSpec);
  const threadParams: Record<string, number> = threadIdParams ? { ...threadIdParams } : {};
  if (params.replyToMessageId != null) {
    threadParams.reply_to_message_id = Math.trunc(params.replyToMessageId);
  }
  const hasThreadParams = Object.keys(threadParams).length > 0;

  const request = createTelegramRetryRunner({
    retry: params.retry ?? creds.retry,
    verbose: params.verbose,
  });

  const wrapChatNotFound = (err: unknown) => {
    if (!/400: Bad Request: chat not found/i.test(formatErrorMessage(err))) {
      return err;
    }
    return new Error(
      `Telegram send failed: chat not found (chat_id=${chatId}). Input was: ${JSON.stringify(params.to)}.`,
    );
  };

  const stickerParams = hasThreadParams ? threadParams : undefined;
  const result = await request(
    () => api.sendSticker(chatId, params.stickerId.trim(), stickerParams),
    "sticker",
  ).catch((err) => {
    throw wrapChatNotFound(err);
  });

  const messageId = String(result?.message_id ?? "unknown");
  const resolvedChatId = String(result?.chat?.id ?? chatId);
  return { messageId, chatId: resolvedChatId };
}

export async function sendPollTelegram(
  creds: TelegramCredentials,
  params: {
    to: string;
    question: string;
    options: string[];
  } & TelegramPollOpts,
): Promise<TelegramSendResult> {
  const target = parseTelegramTarget(params.to);
  const chatId = normalizeChatId(target.chatId);
  const api = resolveApi(creds, params.api);

  const messageThreadId =
    params.messageThreadId != null ? params.messageThreadId : target.messageThreadId;
  const threadSpec =
    messageThreadId != null ? { id: messageThreadId, scope: "forum" as const } : undefined;
  const threadIdParams = buildTelegramThreadParams(threadSpec);

  const request = createTelegramRetryRunner({
    retry: params.retry ?? creds.retry,
    verbose: params.verbose,
  });

  const pollOptions = params.options.map((text) => ({ text }));

  const pollParams: Record<string, unknown> = {
    ...threadIdParams,
    ...(params.isAnonymous !== undefined ? { is_anonymous: params.isAnonymous } : {}),
    ...(params.allowsMultipleAnswers !== undefined
      ? { allows_multiple_answers: params.allowsMultipleAnswers }
      : {}),
  };

  const result = await request(
    () =>
      api.sendPoll(
        chatId,
        params.question,
        pollOptions,
        Object.keys(pollParams).length > 0 ? pollParams : undefined,
      ),
    "poll",
  );

  const messageId = String(result?.message_id ?? "unknown");
  const resolvedChatId = String(result?.chat?.id ?? chatId);
  return { messageId, chatId: resolvedChatId };
}
