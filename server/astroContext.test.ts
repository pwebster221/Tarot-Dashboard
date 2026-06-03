import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getAstroContext, _resetCaches, type KairosFetcher } from "./astroContext.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlay = JSON.parse(
  fs.readFileSync(path.join(__dirname, "__fixtures__/transit_full.json"), "utf8"),
);

function makeFetcher() {
  const calls = { natal: 0, transit: 0 };
  const f: KairosFetcher = {
    async natalFull() { calls.natal++; return overlay.natal; },
    async transitFull() { calls.transit++; return overlay; },
  };
  return { f, calls };
}

beforeEach(() => {
  _resetCaches();
  process.env.BIRTH_NAME = "Paul Webster";
  process.env.BIRTH_DATE = "1989-01-06";
  process.env.BIRTH_TIME = "15:10";
  process.env.BIRTH_LATITUDE = "40.7128";
  process.env.BIRTH_LONGITUDE = "-74.0060";
  process.env.BIRTH_TZ_OFFSET = "-5.0";
  process.env.CURRENT_LATITUDE = "40.7128";
  process.env.CURRENT_LONGITUDE = "-74.0060";
});

test("getAstroContext composes natal + transit text", async () => {
  const { f } = makeFetcher();
  const text = await getAstroContext(f, "2026-06-02");
  assert.match(text, /NATAL CHART/);
  assert.match(text, /TODAY'S SKY/);
});

test("natal cached forever; transit cached per day", async () => {
  const { f, calls } = makeFetcher();
  await getAstroContext(f, "2026-06-02");
  await getAstroContext(f, "2026-06-02");      // same day -> no refetch
  assert.equal(calls.natal, 1);
  assert.equal(calls.transit, 1);
  await getAstroContext(f, "2026-06-03");      // new day -> transit refetch only
  assert.equal(calls.natal, 1);
  assert.equal(calls.transit, 2);
});

test("getAstroContext degrades when a fetcher throws", async () => {
  const f: KairosFetcher = {
    async natalFull() { throw new Error("down"); },
    async transitFull() { throw new Error("down"); },
  };
  const text = await getAstroContext(f, "2026-06-02");
  assert.match(text, /unavailable/);
});
