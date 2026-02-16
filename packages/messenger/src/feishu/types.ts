export type FeishuCredentials = {
  appId: string;
  appSecret: string;
  domain?: FeishuDomain;
};

export type FeishuDomain = "feishu" | "lark" | (string & {});

export type FeishuIdType = "open_id" | "user_id" | "union_id" | "chat_id";

export type FeishuSendResult = {
  messageId: string;
  chatId: string;
};

export type FeishuReaction = {
  reactionId: string;
  emojiType: string;
  operatorType: "app" | "user";
  operatorId: string;
};
