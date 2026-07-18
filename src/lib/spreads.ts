// Client for the Manage Spreads feature (:Spread definitions on the dashboard DB).
export interface SpreadRow {
  spreadType: string;
  name: string | null;
  shortName: string | null;
  positionCount: number;
  positionNames: string[];
  description: string | null;
  readingCount: number;
  locked: boolean; // structure (# cards / position names) fixed once readings exist
}

export async function fetchSpreads(): Promise<SpreadRow[]> {
  const res = await fetch('/api/spreads', { credentials: 'include' });
  if (!res.ok) throw new Error(`spreads fetch ${res.status}`);
  const data = await res.json() as { spreads: SpreadRow[] };
  return data.spreads || [];
}

async function errorOf(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return body.error || `HTTP ${res.status}`;
}

export async function updateSpread(
  spreadType: string,
  body: { name: string; description: string; positionNames?: string[] },
): Promise<{ locked: boolean }> {
  const res = await fetch(`/api/spreads/${encodeURIComponent(spreadType)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorOf(res));
  return res.json();
}

export async function createSpread(body: {
  spreadType: string;
  name: string;
  description: string;
  positionNames: string[];
}): Promise<void> {
  const res = await fetch('/api/spreads', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorOf(res));
}
