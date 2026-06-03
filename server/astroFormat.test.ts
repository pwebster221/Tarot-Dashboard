import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { summarizeNatal, extractNatalPositions, summarizeTransit, computeTransitAspects, summarizeChartLean } from "./astroFormat.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlay = JSON.parse(
  fs.readFileSync(path.join(__dirname, "__fixtures__/transit_full.json"), "utf8")
);

test("summarizeNatal includes header, Sun placement, and whole-sign houses", () => {
  const text = summarizeNatal(overlay.natal);
  assert.match(text, /NATAL CHART/);
  assert.match(text, /Sun[^\n]*Capricorn/);   // Paul's Sun is Capricorn
  assert.match(text, /Sun[^\n]*H8/);             // Sun whole-sign house = 8
});

test("summarizeNatal degrades gracefully on empty input", () => {
  assert.equal(summarizeNatal(null), "Natal chart data unavailable.");
  assert.equal(summarizeNatal({}), "Natal chart data unavailable.");
});

test("summarizeNatal renders a major natal aspects line", () => {
  const text = summarizeNatal(overlay.natal);
  assert.match(text, /Major natal aspects:/);
});

test("extractNatalPositions returns longitudes for the major planets", () => {
  const pos = extractNatalPositions(overlay.natal);
  assert.equal(typeof pos.Sun, "number");
  assert.ok(Object.keys(pos).length >= 8);
});

test("summarizeTransit includes today's sky and patterns; no aspects without natal", () => {
  const text = summarizeTransit(overlay);   // no natal positions passed
  assert.match(text, /TODAY'S SKY/);
  assert.match(text, /Sun[^\n]*Gemini/);    // Sun transiting Gemini on 2026-06-02
  assert.doesNotMatch(text, /Transit-to-natal/);
});

test("computeTransitAspects finds major aspects within orb, sorted tightest-first", () => {
  const pos = extractNatalPositions(overlay.natal);
  const a = computeTransitAspects(pos, overlay.transit.planets, 3);
  assert.equal(a.length, 13);   // committed fixture has exactly 13 within 3°
  assert.ok(a[0].orb <= a[a.length - 1].orb);
  // transiting Pluto is exactly conjunct natal Mercury in the fixture (~0.0°)
  assert.ok(a.some((h) => h.transit === "Pluto" && h.aspect === "Conjunction" && h.natal === "Mercury"));
});

test("summarizeTransit appends locally-computed transit-to-natal aspects", () => {
  const pos = extractNatalPositions(overlay.natal);
  const text = summarizeTransit(overlay, pos);
  assert.match(text, /Transit-to-natal aspects:/);
  assert.match(text, /transiting Pluto Conjunction natal Mercury/);
});

test("summarizeTransit degrades gracefully", () => {
  assert.equal(summarizeTransit(null), "Today's transit data unavailable.");
});

test("summarizeChartLean is one short block with sun sign + a transit note", () => {
  const text = summarizeChartLean(overlay.natal, overlay);
  assert.match(text, /CHART SNAPSHOT/);
  assert.match(text, /Capricorn/);     // Paul's Sun
  assert.ok(text.split("\n").length <= 3);
});
