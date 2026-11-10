#!/usr/bin/env python3
"""Export the graph-held half of the card dossiers to server/dossierData.json.

Run by hand when the Repository's canon changes. The dossier reads this snapshot, not a live
graph, because the structure is fixed canon and a reading should not depend on a graph being
up. Everything derivable (decans, lords, minds, DNA, walk, dodecs) lives in
server/dossierStructure.ts instead and is not exported.

  KG_MCP_URL=https://neo4j.dubtown-server.us/mcp/mcp KG_MCP_AUTH='Bearer ...' \
    python3 scripts/export-dossier-data.py
"""
import json, os, pathlib, urllib.request

URL = os.environ["KG_MCP_URL"]
HEADERS = {
    "Authorization": os.environ["KG_MCP_AUTH"],
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "User-Agent": "arcanum-dossier-export",  # Cloudflare 1010s Python's default agent
}
OUT = pathlib.Path(__file__).resolve().parent.parent / "server" / "dossierData.json"

CARDS = """
MATCH (c:TarotCard) WHERE c.archetype_slug IS NOT NULL
OPTIONAL MATCH (c)-[:EMBODIES_TYPE]->(t)
OPTIONAL MATCH (c)-[:PRIMARY_FUNCTION]->(f1) OPTIONAL MATCH (c)-[:AUXILIARY]->(f2)
OPTIONAL MATCH (c)-[:TERTIARY]->(f3) OPTIONAL MATCH (c)-[:INFERIOR]->(f4)
RETURN c.name AS name, c.card_type AS type, c.number AS number, c.grid_seat AS gridSeat,
  c.kab_path_on_tree AS treePath, c.kab_hebrew_letter AS letter,
  t.name AS mbti, [x IN [f1.name, f2.name, f3.name, f4.name] WHERE x IS NOT NULL] AS stack
ORDER BY name LIMIT 100"""
VOICES = """
MATCH (c:TarotCard)-[:SPEAKS_ON_WHEEL]->(v:WheelVoice)
RETURN c.name AS card, v.form AS form, v.name AS name, v.text AS text
ORDER BY card, form LIMIT 40"""
NUMBERS = """
MATCH (n) WHERE 'Number' IN labels(n) AND n.value >= 0 AND n.value <= 21
RETURN n.value AS value, n.name AS name, n.gp_title AS title, n.gp_description AS description,
  n.factorization AS factorization, n.gp_status AS status
ORDER BY value LIMIT 30"""


def post(body, session=None):
    headers = dict(HEADERS, **({"Mcp-Session-Id": session} if session else {}))
    req = urllib.request.Request(URL, json.dumps(body).encode(), headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        sid = resp.headers.get("Mcp-Session-Id") or session
        raw = resp.read().decode()
    for line in raw.splitlines():      # SSE framing, or a bare JSON body
        if line.startswith("data:"):
            raw = line[5:].strip()
    return json.loads(raw) if raw.strip() else None, sid


def session():
    _, sid = post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-03-26", "capabilities": {},
        "clientInfo": {"name": "arcanum-dossier-export", "version": "1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return sid


def cypher(sid, query, ident):
    res, _ = post({"jsonrpc": "2.0", "id": ident, "method": "tools/call", "params": {
        "name": "execute_cypher", "arguments": {"query": query}}}, sid)
    data = json.loads(res["result"]["content"][0]["text"])
    assert data.get("success"), data
    assert not any("_shed" in row for row in data["raw_data"]), "response was shed"
    return data["raw_data"]


def main():
    sid = session()
    cards = cypher(sid, CARDS, 2)
    voices = cypher(sid, VOICES, 3)
    numbers = cypher(sid, NUMBERS, 4)
    assert len(cards) == 78, len(cards)
    assert len(voices) == 24, len(voices)
    OUT.write_text(json.dumps(
        {"cards": cards, "voices": voices, "numbers": numbers},
        ensure_ascii=False, indent=1) + "\n")
    print(f"{OUT.name}: {len(cards)} cards, {len(voices)} voices, {len(numbers)} numbers")


if __name__ == "__main__":
    main()
