export type Mention = { type: "user" | "department" | "position"; id: string };
export type SelectedMention = Mention & { name: string };
export type MentionToken = SelectedMention & { start: number; end: number };
export type MentionQuery = { start: number; end: number; query: string };

export function mentionQuery(text: string, caret: number): MentionQuery | null {
  const match = /(?:^|[\s([{])@([^\s@]{0,100})$/u.exec(text.slice(0, caret));
  if (!match) return null;
  const start = caret - match[1].length - 1;
  const suffix = /^[^\s@]*/u.exec(text.slice(caret))![0];
  return { start, end: caret + suffix.length, query: match[1] };
}
export function reconcileMentions(previous: string, next: string, tokens: MentionToken[]) {
  let start = 0,
    tail = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  while (
    tail < previous.length - start &&
    tail < next.length - start &&
    previous[previous.length - tail - 1] === next[next.length - tail - 1]
  )
    tail++;
  const end = previous.length - tail,
    delta = next.length - previous.length;
  return tokens.flatMap((token) => {
    const moved =
      token.end <= start
        ? token
        : token.end > end || token.start >= end
          ? { ...token, start: token.start + delta, end: token.end + delta }
          : null;
    return moved &&
      next.slice(moved.start, moved.end) === "@" + moved.name &&
      (moved.start === 0 || /[\s([{]/u.test(next[moved.start - 1])) &&
      (moved.end === next.length || /[\s.,!?;:)}\]]/u.test(next[moved.end]))
      ? [moved]
      : [];
  });
}
export function insertMention(
  text: string,
  tokens: MentionToken[],
  query: MentionQuery,
  person: SelectedMention,
) {
  const tag = "@" + person.name;
  const next = text.slice(0, query.start) + tag + " " + text.slice(query.end);
  if (next.length > 4000) return null;
  return {
    text: next,
    caret: query.start + tag.length + 1,
    tokens: [
      ...reconcileMentions(text, next, tokens),
      { ...person, start: query.start, end: query.start + tag.length },
    ],
  };
}
export function removeMention(text: string, tokens: MentionToken[], target: SelectedMention) {
  const removed = tokens
    .filter((token) => token.id === target.id && token.type === target.type)
    .sort((a, b) => b.start - a.start);
  for (const token of removed) {
    const next =
      text.slice(0, token.start) + text.slice(token.end + (text[token.end] === " " ? 1 : 0));
    tokens = reconcileMentions(text, next, tokens);
    text = next;
  }
  return { text, tokens };
}
export function selectedMentions(tokens: MentionToken[]): SelectedMention[] {
  return [...new Map(tokens.map(({ type, id, name }) => [type + id, { type, id, name }])).values()];
}
