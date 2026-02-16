# @openclaw/messenger

Standalone credential-based messaging library for **Telegram** and **Feishu/Lark**, extracted from OpenClaw. Zero dependency on OpenClaw config, runtime, or telemetry.

## Install

```bash
pnpm add @openclaw/messenger
```

## Directory Structure

```
packages/messenger/
├── src/
│   ├── index.ts                    # Main barrel export
│   ├── telegram/
│   │   ├── index.ts                # Telegram barrel export
│   │   ├── types.ts                # TelegramCredentials, opts types
│   │   ├── send.ts                 # sendMessage, editMessage, deleteMessage, react, sticker, poll
│   │   ├── client.ts               # createTelegramBot (Bot instance with proxy+timeout)
│   │   ├── format.ts               # Markdown → Telegram HTML converter
│   │   ├── targets.ts              # parseTelegramTarget, chat ID normalization
│   │   ├── caption.ts              # splitTelegramCaption (1024 char limit)
│   │   ├── proxy.ts                # makeProxyFetch (undici ProxyAgent)
│   │   ├── retry.ts                # createTelegramRetryRunner (429 retry-after aware)
│   │   ├── thread-params.ts        # buildTelegramThreadParams (forum topics)
│   │   └── network-errors.ts       # isRecoverableTelegramNetworkError
│   ├── feishu/
│   │   ├── index.ts                # Feishu barrel export
│   │   ├── types.ts                # FeishuCredentials, FeishuSendResult, etc.
│   │   ├── send.ts                 # sendMessage, sendCard, sendMarkdownCard, editMessage, updateCard
│   │   ├── client.ts               # createFeishuClient (cached by appId:domain)
│   │   ├── targets.ts              # normalizeFeishuTarget, resolveReceiveIdType
│   │   ├── mention.ts              # @mention formatting for text & card messages
│   │   ├── reactions.ts            # addReaction, removeReaction, listReactions
│   │   └── emojis.ts               # FeishuEmoji constants (THUMBSUP, HEART, etc.)
│   └── internal/
│       ├── retry.ts                # retryAsync with exponential backoff + jitter
│       ├── errors.ts               # MessengerError, formatErrorMessage
│       ├── media.ts                # MediaAttachment type, MIME detection
│       ├── voice.ts                # Voice message compatibility checks
│       └── markdown/
│           ├── ir.ts               # Markdown → IR parser (markdown-it based)
│           └── render.ts           # IR → styled text renderer
└── package.json
```

## Import Paths

```ts
// Everything
import { sendMessageTelegram, sendMessageFeishu } from "@openclaw/messenger";

// Telegram only
import { sendMessageTelegram } from "@openclaw/messenger/telegram";

// Feishu only
import { sendMessageFeishu } from "@openclaw/messenger/feishu";
```

---

## Telegram

### Credentials

```ts
import type { TelegramCredentials } from "@openclaw/messenger/telegram";

const creds: TelegramCredentials = {
  token: "123456:ABC-DEF...", // Bot token from @BotFather
  proxy: { url: "http://proxy:8080" }, // Optional HTTPS proxy
  timeoutSeconds: 30, // Optional API timeout (default: grammy default)
  linkPreview: false, // Optional: disable link previews
  networkErrorRetries: 3, // Optional: max retries on network errors
  retry: { maxRetries: 5, baseDelay: 1000 }, // Optional: custom retry config
};
```

### Send Text Message

```ts
import { sendMessageTelegram } from "@openclaw/messenger/telegram";

const result = await sendMessageTelegram(creds, {
  to: "123456789", // Chat ID, @username, or t.me/username
  text: "**Hello** world!", // Markdown (auto-converted to Telegram HTML)
});
// result: { messageId: "42", chatId: "123456789" }
```

### Send with Options

```ts
await sendMessageTelegram(creds, {
  to: "@mychannel",
  text: "Check this out!",
  textMode: "html", // "markdown" (default) or "html" (pass-through)
  tableMode: "bullets", // "off" | "bullets" | "code" for markdown tables
  silent: true, // Disable notification
  replyToMessageId: 99, // Reply to specific message
  quoteText: "original text", // Quote text in reply
  messageThreadId: 5, // Forum topic thread ID
  buttons: [
    // Inline keyboard
    [
      { text: "Yes", callback_data: "yes" },
      { text: "No", callback_data: "no" },
    ],
  ],
});
```

### Send Media (Image / Video / Audio / Document)

```ts
import { readFile } from "fs/promises";

await sendMessageTelegram(creds, {
  to: "123456789",
  text: "Here's a photo with caption",
  media: {
    buffer: await readFile("photo.jpg"),
    contentType: "image/jpeg", // Determines send method (photo/video/audio/document)
    fileName: "photo.jpg",
  },
});
```

### Send Voice Message

```ts
await sendMessageTelegram(creds, {
  to: "123456789",
  text: "",
  media: {
    buffer: oggBuffer,
    contentType: "audio/ogg",
    fileName: "voice.ogg",
  },
  asVoice: true, // Send as voice message (must be OGG Opus)
});
```

### Send Video Note (Round Video)

```ts
await sendMessageTelegram(creds, {
  to: "123456789",
  text: "",
  media: {
    buffer: videoBuffer,
    contentType: "video/mp4",
  },
  asVideoNote: true,
});
```

### Edit Message

```ts
import { editMessageTelegram } from "@openclaw/messenger/telegram";

await editMessageTelegram(creds, {
  to: "123456789",
  messageId: "42",
  text: "Updated **text**",
  buttons: [], // Pass empty array to remove inline keyboard
});
```

### Delete Message

```ts
import { deleteMessageTelegram } from "@openclaw/messenger/telegram";

await deleteMessageTelegram(creds, {
  to: "123456789",
  messageId: "42",
});
```

### React to Message

```ts
import { reactMessageTelegram } from "@openclaw/messenger/telegram";

// Add reaction
await reactMessageTelegram(creds, {
  to: "123456789",
  messageId: "42",
  emoji: "👍",
});

// Remove reaction
await reactMessageTelegram(creds, {
  to: "123456789",
  messageId: "42",
  emoji: "👍",
  remove: true,
});
```

### Send Sticker

```ts
import { sendStickerTelegram } from "@openclaw/messenger/telegram";

await sendStickerTelegram(creds, {
  to: "123456789",
  stickerId: "CAACAgIAAxkBAAI...", // Telegram file_id
});
```

### Send Poll

```ts
import { sendPollTelegram } from "@openclaw/messenger/telegram";

await sendPollTelegram(creds, {
  to: "123456789",
  question: "What's for lunch?",
  options: ["Pizza", "Sushi", "Tacos"],
  isAnonymous: false,
  allowsMultipleAnswers: true,
});
```

### Utilities

```ts
import {
  markdownToTelegramHtml, // Convert markdown string → Telegram HTML
  markdownToTelegramChunks, // Convert + split into length-limited chunks
  parseTelegramTarget, // Parse "chatId#threadId" format
  splitTelegramCaption, // Split text at 1024-char caption limit
  isRecoverableTelegramNetworkError, // Check if error is retryable
} from "@openclaw/messenger/telegram";
```

---

## Feishu / Lark

### Credentials

```ts
import type { FeishuCredentials } from "@openclaw/messenger/feishu";

const creds: FeishuCredentials = {
  appId: "cli_abc123...",
  appSecret: "xxxxx",
  domain: "feishu", // "feishu" (default) or "lark" for international
};
```

### Send Text Message

```ts
import { sendMessageFeishu } from "@openclaw/messenger/feishu";

const result = await sendMessageFeishu(creds, {
  to: "oc_abc123", // chat_id, open_id, or user_id
  text: "Hello from bot!",
});
// result: { messageId: "om_xxx", chatId: "oc_abc123" }
```

### Send with @Mentions

```ts
await sendMessageFeishu(creds, {
  to: "oc_abc123",
  text: "Please review this",
  mentions: [
    { openId: "ou_user1", name: "Alice", key: "@_user_1" },
    { openId: "ou_user2", name: "Bob", key: "@_user_2" },
  ],
});
```

### Reply to Message

```ts
await sendMessageFeishu(creds, {
  to: "oc_abc123",
  text: "Got it!",
  replyToMessageId: "om_original_msg_id",
});
```

### Send Interactive Card

```ts
import { sendCardFeishu } from "@openclaw/messenger/feishu";

await sendCardFeishu(creds, {
  to: "oc_abc123",
  card: {
    schema: "2.0",
    config: { wide_screen_mode: true },
    body: {
      elements: [{ tag: "markdown", content: "**Status**: Deployed" }],
    },
  },
});
```

### Send Markdown Card (Shorthand)

```ts
import { sendMarkdownCardFeishu } from "@openclaw/messenger/feishu";

await sendMarkdownCardFeishu(creds, {
  to: "oc_abc123",
  text: "**Build passed** - all 83 tests green",
  mentions: [{ openId: "ou_user1", name: "Alice", key: "@_user_1" }],
});
```

### Edit Message

```ts
import { editMessageFeishu } from "@openclaw/messenger/feishu";

await editMessageFeishu(creds, {
  messageId: "om_xxx",
  text: "Updated content",
});
```

### Update Card

```ts
import { updateCardFeishu } from "@openclaw/messenger/feishu";

await updateCardFeishu(creds, {
  messageId: "om_xxx",
  card: {
    schema: "2.0",
    body: { elements: [{ tag: "markdown", content: "**Done**" }] },
  },
});
```

### Reactions

```ts
import {
  addReactionFeishu,
  removeReactionFeishu,
  listReactionsFeishu,
} from "@openclaw/messenger/feishu";

// Add reaction
const { reactionId } = await addReactionFeishu(creds, {
  messageId: "om_xxx",
  emojiType: "THUMBSUP", // See FeishuEmoji constants
});

// Remove reaction
await removeReactionFeishu(creds, {
  messageId: "om_xxx",
  reactionId,
});

// List reactions
const reactions = await listReactionsFeishu(creds, {
  messageId: "om_xxx",
  emojiType: "THUMBSUP", // Optional filter
});
// reactions: [{ reactionId, emojiType, operatorType, operatorId }]
```

### Emoji Constants

```ts
import { FeishuEmoji } from "@openclaw/messenger/feishu";

FeishuEmoji.THUMBSUP; // "THUMBSUP"
FeishuEmoji.HEART; // "HEART"
FeishuEmoji.OK; // "OK"
FeishuEmoji.JIAYI; // "JIAYI" (+1)
// ... etc
```

### Utilities

```ts
import {
  normalizeFeishuTarget, // Normalize target ID
  resolveReceiveIdType, // Auto-detect: open_id / chat_id / user_id
  buildMentionedMessage, // Prepend @mentions to text
  buildMentionedCardContent, // Prepend @mentions for card format
  formatMentionForText, // Single mention → text format
  formatMentionForCard, // Single mention → card format
} from "@openclaw/messenger/feishu";
```

---

## Custom Table Conversion (Feishu)

Feishu doesn't natively render markdown tables. Pass a `convertTables` callback to transform them:

```ts
await sendMessageFeishu(creds, {
  to: "oc_abc123",
  text: "| Name | Score |\n|------|-------|\n| Alice | 95 |",
  convertTables: (text) => {
    // Your custom table-to-text converter
    return text.replace(/\|.*\|/g, (match) => match.replace(/\|/g, "  "));
  },
});
```

---

## Error Handling

All functions throw on failure. Telegram functions include automatic retry with exponential backoff for network errors and 429 rate limits.

```ts
import { MessengerError } from "@openclaw/messenger";

try {
  await sendMessageTelegram(creds, { to: "invalid", text: "hi" });
} catch (err) {
  if (err instanceof MessengerError) {
    console.error(err.code, err.message);
  }
}
```

## Build

```bash
cd packages/messenger
pnpm build    # TypeScript → dist/
pnpm test     # Run 83 unit tests
```

## License

MIT
