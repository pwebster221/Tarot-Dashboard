import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { summarizeNatal, extractNatalPositions } from "./astroFormat.ts";

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
