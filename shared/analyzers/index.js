import { analyzeLuraPull } from "./lura.js";
import { UNKNOWN_REASON_ID } from "../schema.js";

const ANALYZERS_BY_ENCOUNTER = new Map([
  [2874, analyzeLuraPull]
]);

function analyzerByName(name) {
  const n = String(name || "").toLowerCase().trim();
  if (n.includes("lura")) return analyzeLuraPull;
  return null;
}

export function analyzePull(pull, boss) {
  const byId = boss.encounterId ? ANALYZERS_BY_ENCOUNTER.get(Number(boss.encounterId)) : null;
  const byName = analyzerByName(boss.name);
  const analyzer = byId || byName;
  if (!analyzer) return { reasonId: UNKNOWN_REASON_ID, playerId: null, source: "no-analyzer" };
  return analyzer(pull);
}
