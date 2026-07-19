# Sync vendored Persona skills

The per-card Persona skills (Major/Majestic/Minor) are the source of truth in the
`PathsofRevSkills` GitHub repo (`pwebster221/PathsofRevSkills`). `server/personas/`
is a **vendored snapshot** + `index.json` (card display-name → skill file).

To refresh after the persona repo changes:

1. Pull the persona repo (e.g. `/root/pathsofrevskills`): `git pull`.
2. Re-run the vendor script (host-side, needs graph access for the majestic
   card→MBTI mapping): see `scripts/sync-personas.py` logic — it copies each of the
   78 cards' `SKILL.md` into `server/personas/<slug>.md` and rebuilds `index.json`.
   - Major: `major-personas/<Hyphenated-Name>/SKILL.md`
   - Minor: `minor-personas/<suit>/<Rank>-of-<Suit>/SKILL.md`
   - Majestic (20): via `:TarotCard.psych_mbti_type` → `<MBTI|Function>-Cognitive-Framework/SKILL.md`
3. Commit `server/personas/` and deploy.
