import { normalizeReasonId } from "@shared/schema.js";

export function normalizeBossPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return round1(n * 100);
  if (n <= 100) return round1(n);
  return round1(n / 100);
}

export function normalizeFightDetails(raw, config = {}) {
  const deathEntries = getEntries(raw.deathTable);
  const damageEntries = getEntries(raw.damageTakenTable);
  const auraEntries = getEntries(raw.auraTable);
  const interruptEntries = getEntries(raw.interruptTable);
  const dispelEntries = getEntries(raw.dispelTable);
  const deathEvents = raw.deathEvents?.data || [];
  const potionEvents = raw.potionEvents?.data || [];

  return {
    deaths: normalizeDeaths(deathEntries, deathEvents),
    damageTaken: normalizeDamageTaken(damageEntries),
    potionUsage: normalizePotionUsage(auraEntries, potionEvents, config.potionAuras || [], config.players || [], config.abilityNamesById || new Map()),
    interrupts: normalizeActionTable(interruptEntries),
    dispels: normalizeActionTable(dispelEntries),
    participants: normalizeParticipants([deathEntries, damageEntries, auraEntries, interruptEntries, dispelEntries])
  };
}

function normalizeDeaths(entries, events) {
  const fromTable = entries.map((entry) => {
    const ability = entry.killingAbility || entry.killingBlow || entry.ability || entry.cause || {};
    return {
      playerId: playerIdFrom(entry),
      playerName: entry.name || entry.playerName || entry.target?.name || "",
      abilityId: ability.guid || ability.id || entry.abilityGameID || null,
      abilityName: ability.name || entry.abilityName || "Unknown",
      time: entry.timestamp || entry.deathTime || null,
      lastHits: normalizeLastHits(entry)
    };
  });
  if (fromTable.length) return fromTable;
  return events.map((event) => ({
    playerId: playerIdFrom(event.target || event),
    playerName: event.target?.name || event.targetName || "",
    abilityId: event.abilityGameID || event.ability?.guid || null,
    abilityName: event.ability?.name || event.abilityName || "Unknown",
    time: event.timestamp || null,
    lastHits: []
  }));
}

function normalizeDamageTaken(entries) {
  return entries.flatMap((entry) => {
    const playerId = playerIdFrom(entry);
    const playerName = entry.name || entry.playerName || "";
    const abilities = entry.abilities || entry.damageAbilities || entry.breakdown || [];
    if (!abilities.length) {
      return [{ playerId, playerName, abilityId: entry.abilityGameID || null, abilityName: entry.abilityName || "Unknown", hits: entry.hitCount || 0, total: entry.total || 0 }];
    }
    return abilities.map((ability) => ({
      playerId, playerName,
      abilityId: ability.guid || ability.id || null,
      abilityName: ability.name || "Unknown",
      hits: ability.hitCount || ability.hits || 0,
      total: ability.total || ability.amount || 0
    }));
  });
}

function normalizePotionUsage(entries, potionEvents, potionAuras, players, abilityNamesById) {
  const allowed = potionAuras.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  const byPlayer = new Map();

  for (const player of players) {
    byPlayer.set(String(player.id), { playerId: String(player.id), playerName: player.name, used: false, count: 0, potionName: null, potions: [] });
  }

  for (const event of potionEvents) {
    if (!isPotionEvent(event)) continue;
    const abilityId = event.abilityGameID || event.ability?.guid || null;
    const abilityName = event.ability?.name || event.abilityName || abilityNamesById.get(String(abilityId)) || "Unknown";
    if (allowed.length && !allowed.includes(String(abilityName).trim().toLowerCase())) continue;
    const playerId = eventPlayerId(event);
    if (!playerId) continue;
    const playerName = event.target?.name || event.source?.name || byPlayer.get(playerId)?.playerName || "";
    const current = byPlayer.get(playerId) || { playerId, playerName, used: false, count: 0, potionName: null, potions: [] };
    current.used = true;
    current.count += 1;
    current.potionName ||= abilityName;
    const existing = current.potions.find((p) => p.abilityName === abilityName);
    if (existing) existing.count += 1;
    else current.potions.push({ abilityId, abilityName, count: 1 });
    byPlayer.set(playerId, current);
  }

  if (players.length || byPlayer.size) return [...byPlayer.values()];

  return entries.map((entry) => {
    const abilities = entry.abilities || entry.auras || entry.breakdown || [];
    const potionAbilities = abilities.filter((a) => !allowed.length || allowed.includes(String(a.name || "").trim().toLowerCase()));
    return {
      playerId: playerIdFrom(entry),
      playerName: entry.name || "",
      used: potionAbilities.length > 0,
      count: potionAbilities.reduce((s, a) => s + Number(a.total || a.uses || 1), 0),
      potionName: potionAbilities[0]?.name || null,
      potions: potionAbilities.map((a) => ({ abilityId: a.guid || null, abilityName: a.name || "Unknown", count: Number(a.total || a.uses || 1) }))
    };
  }).filter((e) => e.used || allowed.length);
}

function isPotionEvent(event) {
  const type = String(event.type || "").toLowerCase();
  return !type || type === "applybuff" || type === "applybuffstack" || type === "refreshbuff";
}

function eventPlayerId(event) {
  const t = event.targetID || event.target?.id;
  const s = event.sourceID || event.source?.id;
  return t ? String(t) : s ? String(s) : "";
}

function normalizeActionTable(entries) {
  return entries.flatMap((entry) => {
    const abilities = entry.abilities || entry.breakdown || [];
    if (!abilities.length) {
      return [{ playerId: playerIdFrom(entry), playerName: entry.name || "", abilityId: entry.abilityGameID || null, abilityName: entry.abilityName || "Unknown", count: entry.total || entry.count || 0 }];
    }
    return abilities.map((ability) => ({
      playerId: playerIdFrom(entry),
      playerName: entry.name || "",
      abilityId: ability.guid || null,
      abilityName: ability.name || "Unknown",
      count: ability.total || ability.count || 0
    }));
  });
}

function normalizeParticipants(entryGroups) {
  const ids = new Set();
  for (const entries of entryGroups) {
    for (const entry of entries) {
      const id = playerIdFrom(entry);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function getEntries(table) {
  if (!table) return [];
  if (Array.isArray(table)) return table;
  if (Array.isArray(table.entries)) return table.entries;
  if (Array.isArray(table.data?.entries)) return table.data.entries;
  return [];
}

function normalizeLastHits(entry) {
  const hits = entry.lastHits || entry.lastThreeHits || [];
  return [...hits].slice(-3).map((hit) => ({
    abilityId: hit.abilityGameID || hit.guid || null,
    abilityName: hit.name || hit.ability?.name || "Unknown",
    amount: hit.amount || 0,
    time: hit.timestamp || null
  }));
}

function playerIdFrom(entry) {
  const name = entry.name || entry.playerName || entry.target?.name || "";
  return entry.id ? String(entry.id) : normalizeReasonId(name);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
