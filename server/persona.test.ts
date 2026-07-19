import { test } from "node:test";
import assert from "node:assert/strict";
import { getPersonaForCard } from "./persona.ts";

test("getPersonaForCard returns the Major persona for a major", () => {
  const p = getPersonaForCard("The Star");
  assert.match(p, /The-Star-Persona|The Star/);
  assert.ok(p.length > 200);
});

test("getPersonaForCard resolves majestic (court) via MBTI mapping", () => {
  const p = getPersonaForCard("Queen of Chalices");
  assert.ok(p.length > 200);
  assert.match(p, /Cognitive-Framework|ISFP/);
});

test("getPersonaForCard resolves a minor pip", () => {
  const p = getPersonaForCard("Two of Chalices");
  assert.match(p, /Two-of-Chalices|Two of Chalices/);
});

test("getPersonaForCard is case-insensitive and empty for unknown", () => {
  assert.ok(getPersonaForCard("the star").length > 200);
  assert.equal(getPersonaForCard("Not A Card"), "");
  assert.equal(getPersonaForCard(""), "");
});
