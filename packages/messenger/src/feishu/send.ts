import type { MentionTarget } from "./mention.js";
import type { FeishuCredentials, FeishuSendResult } from "./types.js";
import { createFeishuClient } from "./client.js";
import { buildMentionedMessage, buildMentionedCardContent } from "./mention.js";
import { resolveReceiveIdType, normalizeFeishuTarget } from "./targets.js";

function buildFeishuPostMessagePayload(params: { messageText: string }): {
  content: string;
  msgType: string;
} {
  const { messageText } = params;
  return {
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            {
              tag: "md",
              text: messageText,
            },
          ],
        ],
      },
    }),
    msgType: "post",
  };
}

export async function sendMessageFeishu(
  creds: FeishuCredentials,
  params: {
    to: string;
    text: string;
    replyToMessageId?: string;
    mentions?: MentionTarget[];
    convertTables?: (text: string) => string;
  },
): Promise<FeishuSendResult> {
  const { to, text, replyToMessageId, mentions, convertTables } = params;
  const client = createFeishuClient(creds);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);

  let rawText = text ?? "";
  if (mentions && mentions.length > 0) {
    rawText = buildMentionedMessage(mentions, rawText);
  }
  const messageText = convertTables ? convertTables(rawText) : rawText;

  const { content, msgType } = buildFeishuPostMessagePayload({ messageText });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: msgType,
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: msgType,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

export async function sendCardFeishu(
  creds: FeishuCredentials,
  params: {
    to: string;
    card: Record<string, unknown>;
    replyToMessageId?: string;
  },
): Promise<FeishuSendResult> {
  const { to, card, replyToMessageId } = params;
  const client = createFeishuClient(creds);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const content = JSON.stringify(card);

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "interactive",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu card reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: "interactive",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

export function buildMarkdownCard(text: string): Record<string, unknown> {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true },
    body: {
      elements: [
        {
          tag: "markdown",
          content: text,
        },
      ],
    },
  };
}

export async function sendMarkdownCardFeishu(
  creds: FeishuCredentials,
  params: {
    to: string;
    text: string;
    replyToMessageId?: string;
    mentions?: MentionTarget[];
  },
): Promise<FeishuSendResult> {
  const { to, text, replyToMessageId, mentions } = params;
  let cardText = text;
  if (mentions && mentions.length > 0) {
    cardText = buildMentionedCardContent(mentions, text);
  }
  const card = buildMarkdownCard(cardText);
  return sendCardFeishu(creds, { to, card, replyToMessageId });
}

export async function editMessageFeishu(
  creds: FeishuCredentials,
  params: {
    messageId: string;
    text: string;
    convertTables?: (text: string) => string;
  },
): Promise<void> {
  const { messageId, text, convertTables } = params;
  const client = createFeishuClient(creds);
  const messageText = convertTables ? convertTables(text ?? "") : (text ?? "");

  const { content, msgType } = buildFeishuPostMessagePayload({ messageText });

  const response = await client.im.message.update({
    path: { message_id: messageId },
    data: {
      msg_type: msgType,
      content,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu message edit failed: ${response.msg || `code ${response.code}`}`);
  }
}

export async function updateCardFeishu(
  creds: FeishuCredentials,
  params: {
    messageId: string;
    card: Record<string, unknown>;
  },
): Promise<void> {
  const { messageId, card } = params;
  const client = createFeishuClient(creds);
  const content = JSON.stringify(card);

  const response = await client.im.message.patch({
    path: { message_id: messageId },
    data: { content },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card update failed: ${response.msg || `code ${response.code}`}`);
  }
}
