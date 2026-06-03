import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAnchor, SIGN_RULER } from "./correspondences.ts";

test("major cards resolve to planet or sign", () => {
  assert.deepEqual(cardAnchor("The Sun"), { planet: "Sun" });
  assert.deepEqual(cardAnchor("The Hermit"), { sign: "Virgo" });
  assert.equal(cardAnchor("The Tower").planet, "Mars");
});

test("pip cards resolve to their decan planet + sign", () => {
  // 2 of Wands = Aries decan 1 = Mars in Aries
  assert.deepEqual(cardAnchor("Two of Wands"), { planet: "Mars", sign: "Aries" });
  // 5 of Cups = Scorpio decan 1 = Mars in Scorpio
  assert.equal(cardAnchor("Five of Cups").sign, "Scorpio");
});

test("court cards resolve to suit element only", () => {
  assert.deepEqual(cardAnchor("Queen of Wands"), { element: "Fire" });
});

test("sign rulers are traditional", () => {
  assert.equal(SIGN_RULER["Capricorn"], "Saturn");
  assert.equal(SIGN_RULER["Virgo"], "Mercury");
});

import { buildPipCorrespondence } from "./correspondences.ts";

test("buildPipCorrespondence yields 36 pips (ranks 2-10 x 4 suits)", () => {
  assert.equal(Object.keys(buildPipCorrespondence()).length, 36);
});

test("aces and unknown cards return empty anchor", () => {
  assert.deepEqual(cardAnchor("Ace of Wands"), {});
  assert.deepEqual(cardAnchor("Nonsense Card"), {});
  assert.deepEqual(cardAnchor(undefined as any), {});   // missing card name must not throw
});
