export type MentionTarget = {
  openId: string;
  name: string;
  key: string;
};

export function formatMentionForText(target: MentionTarget): string {
  return `<at user_id="${target.openId}">${target.name}</at>`;
}

export function formatMentionAllForText(): string {
  return `<at user_id="all">Everyone</at>`;
}

export function formatMentionForCard(target: MentionTarget): string {
  return `<at id=${target.openId}></at>`;
}

export function formatMentionAllForCard(): string {
  return `<at id=all></at>`;
}

export function buildMentionedMessage(targets: MentionTarget[], message: string): string {
  if (targets.length === 0) {
    return message;
  }
  const mentionParts = targets.map((t) => formatMentionForText(t));
  return `${mentionParts.join(" ")} ${message}`;
}

export function buildMentionedCardContent(targets: MentionTarget[], message: string): string {
  if (targets.length === 0) {
    return message;
  }
  const mentionParts = targets.map((t) => formatMentionForCard(t));
  return `${mentionParts.join(" ")} ${message}`;
}
