import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_UPSERT_CYPHER, NOTE_DELETE_CYPHER,
  SAVE_INSIGHT_CYPHER, UNSAVE_INSIGHT_CYPHER,
  GET_ANNOTATIONS_CYPHER, GET_TREND_CYPHER, SET_TREND_CYPHER,
  GET_USER_STATE_CYPHER, COMPLETE_ONBOARDING_CYPHER,
  GET_CARD_MEANING_CYPHER,
} from "./userData.ts";

test("card meaning walks TarotCard → Archetype composition, with correspondence fallback", () => {
  assert.match(GET_CARD_MEANING_CYPHER, /:TarotCard/);
  assert.match(GET_CARD_MEANING_CYPHER, /toLower\(c\.name\)\s*=\s*toLower\(\$name\)/);
  assert.match(GET_CARD_MEANING_CYPHER, /\(a:Archetype\)-\[:BASED_ON\]->\(c\)/);
  assert.match(GET_CARD_MEANING_CYPHER, /a\.composition_essential_nature AS essential/);
  assert.match(GET_CARD_MEANING_CYPHER, /a\.composition_decan_synthesis AS decanSynthesis/);
  assert.match(GET_CARD_MEANING_CYPHER, /c\.guidance_narrative AS guidance/);
});

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

test("user state read defaults onboarded=false and lens=archetypal", () => {
  assert.match(GET_USER_STATE_CYPHER, /:User \{sub: \$sub\}/);
  assert.match(GET_USER_STATE_CYPHER, /coalesce\(u\.onboarded, false\) AS onboarded/);
  assert.match(GET_USER_STATE_CYPHER, /coalesce\(u\.lens, 'archetypal'\) AS lens/);
});

test("complete onboarding flips the flag and coalesces optional profile fields", () => {
  assert.match(COMPLETE_ONBOARDING_CYPHER, /MERGE \(u:User \{sub: \$sub\}\)/);
  assert.match(COMPLETE_ONBOARDING_CYPHER, /u\.onboarded = true/);
  assert.match(COMPLETE_ONBOARDING_CYPHER, /u\.lens = \$lens/);
  // optional fields must not clobber a prior value when null is passed
  assert.match(COMPLETE_ONBOARDING_CYPHER, /u\.display_name = coalesce\(\$displayName, u\.display_name\)/);
  assert.match(COMPLETE_ONBOARDING_CYPHER, /u\.birth_date = coalesce\(\$birthDate, u\.birth_date\)/);
});
