import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mentionQuery,
  insertMention,
  reconcileMentions,
  removeMention,
  selectedMentions,
} from "../src/features/portal/mention-text.ts";

const sunday = { type: "user" as const, id: "sunday", name: "Sunday" };
const finance = { type: "department" as const, id: "finance", name: "ການເງິນ" };

test("mention detection respects emails, caret position and Unicode", () => {
  assert.deepEqual(mentionQuery("@", 1), { start: 0, end: 1, query: "" });
  assert.equal(mentionQuery("email@example.com", 17), null);
  assert.deepEqual(mentionQuery("Ready @Sunday later", 9), {
    start: 6,
    end: 13,
    query: "Su",
  });
  assert.deepEqual(mentionQuery("ວຽກ @ການ", 8), { start: 4, end: 8, query: "ການ" });
  assert.equal(mentionQuery("@Sunday ", 8), null);
});

test("editing outside a tag preserves its recipient; changing or merging its name removes it", () => {
  const added = insertMention("@Su", [], mentionQuery("@Su", 3)!, sunday)!;
  assert.equal(added.text, "@Sunday ");
  const prefixed = "😀 " + added.text;
  const moved = reconcileMentions(added.text, prefixed, added.tokens);
  assert.equal(moved[0].start, 3);
  assert.equal(prefixed.slice(moved[0].start, moved[0].end), "@Sunday");
  assert.deepEqual(selectedMentions(moved), [sunday]);
  for (const changed of ["@Sunda ", "@SundayExtra ", "email@Sunday ", ""]) {
    assert.deepEqual(reconcileMentions(added.text, changed, added.tokens), []);
  }
});

test("multiple occurrences send one recipient and removing its chip preserves other tags", () => {
  const first = insertMention("@", [], mentionQuery("@", 1)!, sunday)!;
  const text = first.text + "@";
  const second = insertMention(text, first.tokens, mentionQuery(text, text.length)!, sunday)!;
  assert.equal(second.tokens.length, 2);
  assert.deepEqual(selectedMentions(second.tokens), [sunday]);
  const thirdText = second.text + "@";
  const third = insertMention(
    thirdText,
    second.tokens,
    mentionQuery(thirdText, thirdText.length)!,
    finance,
  )!;
  const removed = removeMention(third.text, third.tokens, sunday);
  assert.equal(removed.text, "@ການເງິນ ");
  assert.deepEqual(selectedMentions(removed.tokens), [finance]);
  assert.equal(removed.tokens[0].start, 0);
});

test("selecting a name cannot exceed the API text limit", () => {
  const text = "x".repeat(3997) + " @";
  assert.equal(insertMention(text, [], mentionQuery(text, text.length)!, sunday), null);
});
