import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildCardPlacementIndex, resolveCardFocus } from "./cardChart.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlay = JSON.parse(fs.readFileSync(path.join(__dirname, "__fixtures__/transit_full.json"), "utf8"));
const natal = overlay.natal;

test("index maps a sign_major card to every placement in that sign", () => {
  const idx = buildCardPlacementIndex(natal);
  const devil = idx["The Devil"] || [];
  const bodies = devil.map((p) => p.body);
  assert.ok(bodies.includes("Sun"));
  assert.ok(bodies.includes("Moon"));
});

test("index maps a planet_major card to that body", () => {
  const idx = buildCardPlacementIndex(natal);
  const sun = idx["The Sun"] || [];
  assert.ok(sun.some((p) => p.body === "Sun"));
});

test("resolveCardFocus uses a direct placement when present", () => {
  const idx = buildCardPlacementIndex(natal);
  const txt = resolveCardFocus("The Devil", natal, idx, overlay);
  assert.match(txt, /Capricorn/);
  assert.match(txt, /natal/i);
});

test("resolveCardFocus falls back to ruling planet for unmapped cards", () => {
  const idx = buildCardPlacementIndex(natal);
  const txt = resolveCardFocus("The Hermit", natal, idx, overlay);
  assert.match(txt, /Mercury|Virgo/);
  assert.ok(txt.length > 0);
});
