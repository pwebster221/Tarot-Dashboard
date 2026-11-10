import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceChartGate, flagChartBodies, occupantsOf, renderCompany, rewriteRequest } from "./chartGate.ts";

// Saturn 276.3 is Capricorn I, Sun 286.5 Capricorn II, Mars 23.2 Aries III, Mercury 305.4 Aquarius I.
const overlay = {
  natal: { _raw: { planets: {
    Saturn: { lon: 276.3 }, Sun: { lon: 286.5 }, Mars: { lon: 23.2 }, Mercury: { lon: 305.4 },
    "North Node": { lon: 336.0 }, "Mean North Node": { lon: 337.5 },
  } } },
  transit: { planets: { Saturn: { longitude: 8.0 }, Pluto: { longitude: 305.3 } } },
};

test("a pip's company is whoever stands in its decan, natal or transit", () => {
  const got = occupantsOf("Five of Swords", overlay); // Aquarius I
  assert.deepEqual(got.map((o) => `${o.source} ${o.body}`), ["natal Mercury", "transit Pluto"]);
  assert.equal(got[0].station, undefined);
});

test("a pip with nobody in its decan gets no chart at all", () => {
  const got = occupantsOf("Three of Chalices", overlay);
  assert.deepEqual(got, []);
  assert.equal(renderCompany(got), "");
});

test("a senior court's occupant acts at the station where it sits", () => {
  // The Knight of Pentacles' road is Aries III, Taurus I, Taurus II; Mars stands on the Operator.
  const got = occupantsOf("Knight of Pentacles", overlay);
  assert.deepEqual(got.map((o) => [o.body, o.station]), [["Mars", "Operator"]]);
  assert.match(renderCompany(got), /Natal Mars stands in Aries III, at the Operator station/);
});

test("a Major's company comes from its whole committee", () => {
  // The Devil is Capricorn's three decans.
  assert.deepEqual(occupantsOf("The Devil", overlay).map((o) => o.body), ["Saturn", "Sun"]);
});

test("the mean nodes do not double the true node", () => {
  assert.deepEqual(occupantsOf("Eight of Chalices", overlay).map((o) => o.body), ["North Node"]); // Pisces I
});

test("a card outside the 78 has no company", () => {
  assert.deepEqual(occupantsOf("Not A Card", overlay), []);
});

test("the company block says to read it through the card", () => {
  assert.match(renderCompany(occupantsOf("The Devil", overlay)), /read each through the card, never as a chart fact/);
});

const devil = occupantsOf("The Devil", overlay);

test("a planet's bare name is structure, not a chart fact", () => {
  assert.deepEqual(flagChartBodies("Saturn's night mind keeps this shrine, and Mars presides.", overlay, []), []);
});

test("a chart statement outside the allowed set is flagged", () => {
  assert.deepEqual(flagChartBodies("Your Mercury sharpens this.", overlay, devil), ["Your Mercury"]);
  assert.deepEqual(flagChartBodies("Natal Mars pushes here.", overlay, devil), ["Natal Mars"]);
  assert.deepEqual(flagChartBodies("Transiting Pluto presses on it.", overlay, devil), ["Transiting Pluto"]);
});

test("an allowed occupant passes, in its own source only", () => {
  assert.deepEqual(flagChartBodies("Your Saturn stands inside this card.", overlay, devil), []);
  assert.deepEqual(flagChartBodies("Transiting Saturn arrives.", overlay, devil), ["Transiting Saturn"]);
});

test("body-in-sign flags only a placement the chart really has", () => {
  assert.deepEqual(flagChartBodies("Mercury in Aquarius speaks.", overlay, devil), ["Mercury in Aquarius"]);
  assert.deepEqual(flagChartBodies("Mercury in Virgo is at home.", overlay, devil), []);
  assert.deepEqual(flagChartBodies("Saturn in Capricorn holds it.", overlay, devil), []);
});

test("body-in-sign matches whatever the casing", () => {
  assert.deepEqual(flagChartBodies("mercury in Aquarius speaks.", overlay, devil), ["mercury in Aquarius"]);
  assert.deepEqual(flagChartBodies("Mercury in aquarius speaks.", overlay, devil), ["Mercury in aquarius"]);
  assert.deepEqual(flagChartBodies("saturn in capricorn holds it.", overlay, devil), []);
});

test("a body placed in a house is a chart statement", () => {
  assert.deepEqual(flagChartBodies("Saturn in your eighth house brings closure.", overlay, []), ["Saturn in your eighth house"]);
  assert.deepEqual(flagChartBodies("Mars in the first house pushes.", overlay, []), ["Mars in the first house"]);
  // An allowed occupant comes with its decan only, so any house claimed for it is invented.
  assert.deepEqual(flagChartBodies("Saturn in your eighth house stands inside this card.", overlay, devil), ["Saturn in your eighth house"]);
});

test("the Home line's silhouette is not a chart statement", () => {
  assert.deepEqual(flagChartBodies("Uranus stands as the modern silhouette of this house.", overlay, []), []);
  assert.deepEqual(flagChartBodies("Relayed through your second house by Inanna.", overlay, []), []);
});

test("an allowed occupant cannot be given a sign it is not in", () => {
  assert.deepEqual(flagChartBodies("Your Saturn is in Aquarius.", overlay, devil), ["Your Saturn is in Aquarius"]);
  assert.deepEqual(flagChartBodies("Natal Sun in Leo glows.", overlay, devil), ["Natal Sun in Leo"]);
  assert.deepEqual(flagChartBodies("Your Saturn is in Capricorn.", overlay, devil), []);
});

test("motion and aspects are never supplied, so they are always flagged", () => {
  assert.deepEqual(flagChartBodies("Your Saturn is retrograde.", overlay, devil), ["Saturn is retrograde"]);
  assert.deepEqual(flagChartBodies("Natal Saturn trines Mars.", overlay, devil), ["Saturn trines Mars"]);
  assert.deepEqual(flagChartBodies("Saturn square your Sun tightens it.", overlay, devil), ["Saturn square your Sun"]);
  assert.deepEqual(flagChartBodies("The square of the Tower holds.", overlay, devil), []);
});

test("the querent's angles are not available to a card", () => {
  assert.deepEqual(flagChartBodies("Your Ascendant colors this.", overlay, []), ["Your Ascendant"]);
  assert.deepEqual(flagChartBodies("Your rising dread is the point.", overlay, []), []);
});

test("a clean reading is not rewritten", async () => {
  let calls = 0;
  const r = await enforceChartGate("clean", () => [], async () => { calls++; return "x"; });
  assert.deepEqual(r, { text: "clean", flagged: [], rewritten: false });
  assert.equal(calls, 0);
});

test("a flagged reading is rewritten exactly once", async () => {
  let calls = 0;
  const flag = (t: string) => (t === "bad" ? ["Your Mars"] : []);
  const r = await enforceChartGate("bad", flag, async (flags) => { calls++; assert.deepEqual(flags, ["Your Mars"]); return "good"; });
  assert.deepEqual(r, { text: "good", flagged: [], rewritten: true });
  assert.equal(calls, 1);
});

test("a retry that is still flagged reports it and stops", async () => {
  let calls = 0;
  const r = await enforceChartGate("bad", () => ["Your Mars"], async () => { calls++; return "still bad"; });
  assert.equal(calls, 1);
  assert.deepEqual(r, { text: "still bad", flagged: ["Your Mars"], rewritten: true });
});

test("a failed rewrite keeps the original and its flags", async () => {
  const r = await enforceChartGate("bad", () => ["Your Mars"], async () => { throw new Error("down"); });
  assert.deepEqual(r, { text: "bad", flagged: ["Your Mars"], rewritten: false });
});

test("the retry request names what was caught and carries the draft", () => {
  const u = rewriteRequest("USER", "DRAFT-TEXT", ["Your Mars"]);
  assert.match(u, /^USER/);
  assert.match(u, /Your Mars/);
  assert.match(u, /DRAFT-TEXT/);
});
