export type TelegramThreadSpec = {
  id?: number;
  scope: "dm" | "forum" | "none";
};

const TELEGRAM_GENERAL_TOPIC_ID = 1;

export function buildTelegramThreadParams(thread?: TelegramThreadSpec | null) {
  if (!thread?.id) {
    return undefined;
  }
  const normalized = Math.trunc(thread.id);
  if (normalized === TELEGRAM_GENERAL_TOPIC_ID && thread.scope === "forum") {
    return undefined;
  }
  return { message_thread_id: normalized };
}
