import { test } from "node:test";
import assert from "node:assert/strict";
import { UPSERT_USER_CYPHER } from "./authProfile.ts";

test("upsert cypher MERGEs on sub and sets profile fields", () => {
  assert.match(UPSERT_USER_CYPHER, /MERGE \(u:User \{sub: \$sub\}\)/);
  assert.match(UPSERT_USER_CYPHER, /u\.email\s*=\s*\$email/);
  assert.match(UPSERT_USER_CYPHER, /u\.display_name\s*=\s*\$name/);
});
