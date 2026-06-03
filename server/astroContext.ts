// server/astroContext.ts — birth/observer config, Kairos fetch, caching, composition.
import { summarizeNatal, summarizeTransit, extractNatalPositions } from "./astroFormat.ts";

export interface KairosFetcher {
  natalFull(body: any): Promise<any>;
  transitFull(body: any): Promise<any>;
}

let _natalCache: { text: string; positions: Record<string, number> } | null = null;
let _transitCache: { date: string; text: string } | null = null;

/** Test helper: clear in-memory caches. */
export function _resetCaches(): void {
  _natalCache = null;
  _transitCache = null;
}

function birthData() {
  return {
    name: process.env.BIRTH_NAME,
    date: process.env.BIRTH_DATE,
    time: process.env.BIRTH_TIME,
    latitude: Number(process.env.BIRTH_LATITUDE),
    longitude: Number(process.env.BIRTH_LONGITUDE),
    city: process.env.BIRTH_CITY,
    tz_offset: process.env.BIRTH_TZ_OFFSET != null
      ? Number(process.env.BIRTH_TZ_OFFSET) : undefined,
  };
}

function observer() {
  return {
    lat: Number(process.env.CURRENT_LATITUDE),
    lon: Number(process.env.CURRENT_LONGITUDE),
  };
}

const KAIROS_BASE = () => process.env.KAIROS_BASE || "https://raw-charts.dubtown-server.us";

export function defaultKairosFetcher(): KairosFetcher {
  return {
    async natalFull(body) {
      // NOTE: we source the natal chart from transit/full's embedded `.natal`,
      // NOT /api/v1/natal/full. Only transit/full carries the `.natal._raw`
      // shape (planets with lon/sign/deg/house_w/rx + the aspects list) that
      // the natal extractors consume; standalone natal/full omits `_raw`.
      const r = await fetch(`${KAIROS_BASE()}/api/v1/transit/full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Kairos natal ${r.status}`);
      const data: any = await r.json();
      return data.natal;
    },
    async transitFull(body) {
      const r = await fetch(`${KAIROS_BASE()}/api/v1/transit/full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Kairos transit ${r.status}`);
      return r.json();
    },
  };
}

async function natalSummary(
  f: KairosFetcher,
): Promise<{ text: string; positions: Record<string, number> }> {
  if (_natalCache) return _natalCache;
  try {
    const data = await f.natalFull({
      birth_data: birthData(),
      anonymous: true,
      house_system: "whole_sign",
    });
    _natalCache = {
      text: summarizeNatal(data),
      positions: extractNatalPositions(data),
    };
  } catch (err) {
    console.error("[astroContext] natal fetch failed:", err);
    return { text: "Natal chart data unavailable.", positions: {} };
  }
  return _natalCache!;
}

async function transitSummary(
  f: KairosFetcher,
  today: string,
  natalPositions: Record<string, number>,
): Promise<string> {
  if (_transitCache && _transitCache.date === today) return _transitCache.text;
  try {
    const obs = observer();
    const data = await f.transitFull({
      birth_data: birthData(),
      anonymous: true,
      observer_latitude: obs.lat,
      observer_longitude: obs.lon,
    });
    const text = summarizeTransit(data, natalPositions);
    _transitCache = { date: today, text };
    return text;
  } catch (err) {
    console.error("[astroContext] transit fetch failed:", err);
    return "Today's transit data unavailable.";
  }
}

export async function getAstroContext(
  f: KairosFetcher = defaultKairosFetcher(),
  today: string = new Date().toISOString().slice(0, 10),
): Promise<string> {
  // Natal resolves first: its positions feed the transit-to-natal aspect math.
  const natal = await natalSummary(f);
  const transit = await transitSummary(f, today, natal.positions);
  return `${natal.text}\n\n${transit}`;
}
