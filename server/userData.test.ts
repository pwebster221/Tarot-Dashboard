import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_UPSERT_CYPHER, NOTE_DELETE_CYPHER,
  SAVE_INSIGHT_CYPHER, UNSAVE_INSIGHT_CYPHER,
  GET_ANNOTATIONS_CYPHER, GET_TREND_CYPHER, SET_TREND_CYPHER,
} from "./userData.ts";

test("note upsert keys on sub + reading id and sets text", () => {
  assert.match(NOTE_UPSERT_CYPHER, /:User \{sub: \$sub\}/);
  assert.match(NOTE_UPSERT_CYPHER, /:Reading \{id: \$readingId\}/);
  assert.match(NOTE_UPSERT_CYPHER, /\[n:NOTED\]/);
  assert.match(NOTE_UPSERT_CYPHER, /n\.text\s*=\s*\$text/);
});

test("save insight keys on sub + reading + card_id", () => {
  assert.match(SAVE_INSIGHT_CYPHER, /\[s:SAVED_INSIGHT \{card_id: \$cardId\}\]/);
  assert.match(SAVE_INSIGHT_CYPHER, /:Reading \{id: \$readingId\}/);
  assert.match(SAVE_INSIGHT_CYPHER, /s\.text\s*=\s*\$text/);
});

test("trend insight stored on the user node by sub", () => {
  assert.match(SET_TREND_CYPHER, /:User \{sub: \$sub\}/);
  assert.match(SET_TREND_CYPHER, /u\.trend_insight\s*=\s*\$text/);
  assert.match(GET_TREND_CYPHER, /RETURN u\.trend_insight/);
});

test("delete/unsave cyphers target the right rels", () => {
  assert.match(NOTE_DELETE_CYPHER, /\[n:NOTED\]/);
  assert.match(NOTE_DELETE_CYPHER, /DELETE n/);
  assert.match(UNSAVE_INSIGHT_CYPHER, /\[s:SAVED_INSIGHT \{card_id: \$cardId\}\]/);
  assert.match(UNSAVE_INSIGHT_CYPHER, /DELETE s/);
});
