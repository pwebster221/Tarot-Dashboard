import { test } from "node:test";
import assert from "node:assert/strict";
import { profileForCard, maniReady, maniAttune } from "./mani.ts";

test("maniReady is false before init", () => {
  assert.equal(maniReady(), false);
});

test("maniAttune returns '' when Mani is not connected", async () => {
  assert.equal(await maniAttune("q", "jung", "conv"), "");
});

test("profileForCard maps tiers to documented profiles", () => {
  assert.equal(profileForCard({ card: { arcana: "Major", name: "The Sun" } }), "arendt");
  assert.equal(profileForCard({ card: { arcana: "Minor", name: "Queen of Cups", suit: "Cups" } }), "jung"); // court
  assert.equal(profileForCard({ card: { arcana: "Minor", name: "Three of Wands", suit: "Wands" } }), "qiu_jin");
  assert.equal(profileForCard({ card: { arcana: "Minor", name: "Five of Chalices", suit: "Chalices" } }), "kahlo");
  assert.equal(profileForCard({ card: { arcana: "Minor", name: "Seven of Swords", suit: "Swords" } }), "newton");
  assert.equal(profileForCard({ card: { arcana: "Minor", name: "Ten of Pentacles", suit: "Pentacles" } }), "newton");
  assert.equal(profileForCard({ card: {} }), "jung");
});
