import { resolvePullReason, allPulls } from "./schema.js";

export function calculateWipeReasons(boss, filterPlayerId = null) {
  const pulls = allPulls(boss).filter((pull) => {
    if (!filterPlayerId) return true;
    return resolvePullReason(pull).playerId === filterPlayerId;
  });
  const total = pulls.length;
  if (!total) return { total: 0, reasons: [] };

  const counts = new Map();
  for (const pull of pulls) {
    const r = resolvePullReason(pull);
    counts.set(r.reasonId, (counts.get(r.reasonId) || 0) + 1);
  }

  const reasons = boss.wipeReasons
    .map((reason) => {
      const count = counts.get(reason.id) || 0;
      return { reasonId: reason.id, label: reason.label, color: reason.color, count, percent: Math.round((count / total) * 1000) / 10 };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return { total, reasons };
}

export function calculateWipeReasonsByPlayer(boss, players) {
  const pulls = allPulls(boss);
  const total = pulls.length;
  if (!total) return { total: 0, players: [] };

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const byPlayer = new Map();

  for (const pull of pulls) {
    const r = resolvePullReason(pull);
    if (!r.playerId) continue;
    const existing = byPlayer.get(r.playerId) || {
      playerId: r.playerId,
      playerName: playerMap.get(r.playerId)?.name || r.playerId,
      playerClass: playerMap.get(r.playerId)?.class || null,
      count: 0
    };
    existing.count += 1;
    byPlayer.set(r.playerId, existing);
  }

  return {
    total,
    players: [...byPlayer.values()]
      .sort((a, b) => b.count - a.count)
      .map((p) => ({ ...p, percent: Math.round((p.count / total) * 1000) / 10 }))
  };
}

export function calculateTeamPerformance(boss) {
  const pulls = allPulls(boss).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  let bestHp = 100;

  return pulls.map((pull, index) => {
    const r = resolvePullReason(pull);
    const hp = pull.bossHpPercent ?? 100;
    if (hp < bestHp) bestHp = hp;
    return {
      pullIndex: index + 1,
      pullId: pull.id,
      phase: pull.phase,
      bossHpPercent: hp,
      duration: pull.duration || null,
      reasonId: r.reasonId,
      date: pull.startedAt,
      isBest: hp === bestHp
    };
  });
}

export function calculatePlayerReview(boss, playerId) {
  const pulls = allPulls(boss).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  const damageTotals = new Map();
  const deathCounts = new Map();
  const potUsage = [];

  for (const [pullIndex, pull] of pulls.entries()) {
    for (const dt of pull.damageTaken || []) {
      if (dt.playerId !== playerId) continue;
      const key = dt.abilityId ? String(dt.abilityId) : dt.abilityName;
      const existing = damageTotals.get(key) || { abilityId: dt.abilityId, abilityName: dt.abilityName, totalDamage: 0, hits: 0, pullCount: 0 };
      existing.totalDamage += dt.total || 0;
      existing.hits += dt.hits || 0;
      existing.pullCount += 1;
      damageTotals.set(key, existing);
    }

    for (const death of pull.deaths || []) {
      if (death.playerId !== playerId) continue;
      const key = death.abilityId ? String(death.abilityId) : death.abilityName;
      const existing = deathCounts.get(key) || { abilityId: death.abilityId, abilityName: death.abilityName, count: 0 };
      existing.count += 1;
      deathCounts.set(key, existing);
    }

    const pot = pull.potionUsage?.find((p) => p.playerId === playerId);
    potUsage.push({
      pullIndex: pullIndex + 1,
      pullId: pull.id,
      phase: pull.phase,
      bossHpPercent: pull.bossHpPercent,
      date: pull.startedAt,
      used: pot?.used || false,
      potionName: pot?.potionName || null
    });
  }

  return {
    damageTaken: [...damageTotals.values()]
      .sort((a, b) => b.totalDamage - a.totalDamage)
      .map((d) => ({ ...d, avgPerHit: d.hits > 0 ? Math.round(d.totalDamage / d.hits) : 0 })),
    deaths: [...deathCounts.values()].sort((a, b) => b.count - a.count),
    potUsage
  };
}
