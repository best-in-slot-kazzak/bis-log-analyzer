export const WOW_CLASS_COLORS = {
  DeathKnight: "#c41e3a",
  DemonHunter: "#a330c9",
  Druid: "#ff7c0a",
  Evoker: "#33937f",
  Hunter: "#aad372",
  Mage: "#3fc7eb",
  Monk: "#00ff98",
  Paladin: "#f48cba",
  Priest: "#ffffff",
  Rogue: "#fff468",
  Shaman: "#0070dd",
  Warlock: "#8788ee",
  Warrior: "#c69b6d"
};

export const UNKNOWN_REASON_ID = "unknown";

export const DEFAULT_WIDGETS = [
  { id: "team-performance", type: "teamPerformance", title: "Team Performance", enabled: true, order: 0 },
  { id: "wipe-reasons", type: "wipeReasons", title: "Wipe Reasons", enabled: true, order: 1 },
  { id: "player-review", type: "playerReview", title: "Player Review", enabled: true, order: 2 },
  { id: "death-heatmap", type: "deathHeatmap", title: "Death Heatmap", enabled: false, order: 3 },
  { id: "all-pulls", type: "allPulls", title: "All Pulls", enabled: false, order: 4 }
];

export function createEmptyDashboardData() {
  return { version: 2, generatedAt: new Date().toISOString(), players: [], bosses: [] };
}

export function createUnknownReason() {
  return { id: UNKNOWN_REASON_ID, label: "Unknown", color: "#6b7280" };
}

export function normalizeReasonId(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || UNKNOWN_REASON_ID;
}

export function getPlayerColor(player) {
  return WOW_CLASS_COLORS[player?.class] || "#d1d5db";
}

// Returns a short phase label (P1, I1, P2 …) using the stored phase map.
// Falls back to "P{n}" when no map is available (backwards compatible).
export function phaseLabel(phase, phaseMap) {
  if (phase == null) return "?";
  if (phaseMap?.length) {
    const idx = phaseMap.findIndex((p) => p.id === phase);
    if (idx !== -1) {
      const entry = phaseMap[idx];
      const rank = phaseMap.slice(0, idx + 1).filter((p) => p.isIntermission === entry.isIntermission).length;
      return entry.isIntermission ? `I${rank}` : `P${rank}`;
    }
  }
  return `P${phase + 1}`;
}

export function resolvePullReason(pull) {
  return pull?.manualWipeReason || pull?.autoWipeReason || {
    reasonId: UNKNOWN_REASON_ID,
    playerId: null,
    source: "default"
  };
}

export function ensureBossDefaults(boss) {
  const hasUnknown = boss.wipeReasons?.some((r) => r.id === UNKNOWN_REASON_ID);

  // Merge: keep existing widget configuration (order/enabled) but append any
  // newly-introduced default widgets the boss doesn't have yet.
  const existingWidgets = boss.widgets || [];
  const existingIds = new Set(existingWidgets.map((w) => w.id));
  const missingDefaults = DEFAULT_WIDGETS
    .filter((w) => !existingIds.has(w.id))
    .map((w) => ({ ...w }));
  const widgets = existingWidgets.length
    ? [...existingWidgets, ...missingDefaults]
    : [...DEFAULT_WIDGETS];

  return {
    ...boss,
    wipeReasons: hasUnknown ? boss.wipeReasons : [createUnknownReason(), ...(boss.wipeReasons || [])],
    reports: boss.reports || [],
    widgets,
    playerReviewConfig: boss.playerReviewConfig || { abilities: [], potionAuras: [], potionWindows: [], tanks: [] },
    phaseMap: boss.phaseMap || [],
    deathMapConfig: boss.deathMapConfig
      ? { mapBoundsByPhase: {}, publicPhases: [], ...boss.deathMapConfig }
      : { imageUrl: "", mapBounds: null, mapBoundsByPhase: {}, publicPhases: [] }
  };
}

export function createNewBoss(name, existingCount) {
  const bossName = name?.trim() || `Boss ${existingCount + 1}`;
  return {
    id: normalizeReasonId(`${bossName}-mythic`),
    name: bossName,
    difficulty: "Mythic",
    encounterId: null,
    imageUrl: "",
    wipeReasons: [{ id: UNKNOWN_REASON_ID, label: "Unknown", color: "#6b7280" }],
    playerReviewConfig: { abilities: [], potionAuras: [], potionWindows: [], tanks: [] },
    phaseMap: [],
    deathMapConfig: { imageUrl: "", mapBounds: null, mapBoundsByPhase: {}, publicPhases: [] },
    widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })),
    reports: []
  };
}

export function allPulls(boss) {
  return (boss.reports || []).flatMap((r) => r.pulls || []);
}
