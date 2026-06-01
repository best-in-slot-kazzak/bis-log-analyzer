import { UNKNOWN_REASON_ID } from "../schema.js";

const TERMINATE_ID = "1286276";

export function analyzeLuraPull(pull) {
  const terminateDeath = pull.deaths?.find((d) => String(d.abilityId) === TERMINATE_ID);
  if (terminateDeath) {
    return { reasonId: "missed-interrupt", playerId: terminateDeath.playerId || null, source: "lura-terminate" };
  }
  return { reasonId: UNKNOWN_REASON_ID, playerId: null, source: "lura-fallback" };
}
