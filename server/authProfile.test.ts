import { test } from "node:test";
import assert from "node:assert/strict";
import { UPSERT_USER_CYPHER } from "./authProfile.ts";

test("upsert cypher MERGEs on sub and sets profile fields", () => {
  assert.match(UPSERT_USER_CYPHER, /MERGE \(u:User \{sub: \$sub\}\)/);
  assert.match(UPSERT_USER_CYPHER, /u\.email\s*=\s*\$email/);
  assert.match(UPSERT_USER_CYPHER, /u\.display_name\s*=\s*\$name/);
});

test("new users are created not-onboarded (so the first-run flow shows once)", () => {
  // ON CREATE seeds the onboarding flag + default lens; ON MATCH must not reset them
  assert.match(UPSERT_USER_CYPHER, /ON CREATE SET[\s\S]*u\.onboarded = false/);
  assert.match(UPSERT_USER_CYPHER, /ON CREATE SET[\s\S]*u\.lens = 'archetypal'/);
  const onMatch = UPSERT_USER_CYPHER.split(/ON MATCH/)[1] ?? "";
  assert.ok(!/onboarded/.test(onMatch), "ON MATCH must not touch u.onboarded");
});
