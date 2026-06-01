import { parseWarcraftLogsReportUrl } from "@shared/report-url.js";

const AUTHORIZATION_URL = "https://www.warcraftlogs.com/oauth/authorize";
const TOKEN_ENDPOINT = "/wcl/oauth/token";
const GRAPHQL_ENDPOINT = "/wcl/api/v2/user";

export function createAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", state });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

export function createCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createCodeChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  return btoa([...bytes].map((b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function exchangeAuthorizationCode({ clientId, clientSecret, code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    headers.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("code_verifier", codeVerifier);
  }
  const response = await fetch(TOKEN_ENDPOINT, { method: "POST", headers, body });
  if (!response.ok) throw new Error(`Token exchange failed with ${response.status}.`);
  const token = await response.json();
  return { ...token, receivedAt: Date.now(), expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null };
}

export async function testClientCredentials({ clientId, clientSecret }) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`Credentials test failed with ${response.status}: ${payload.error_description || payload.message || text}`);
  return payload;
}

export async function graphqlRequest(token, query, variables = {}) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
    body: JSON.stringify({ query, variables })
  });
  if (!response.ok) throw new Error(`WarcraftLogs API failed with ${response.status}.`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));
  return payload.data;
}

export async function fetchCurrentUser(token) {
  const data = await graphqlRequest(token, `query { userData { currentUser { id name } } }`);
  return data.userData.currentUser;
}

export async function fetchUserReports(token, userId) {
  const data = await graphqlRequest(token, `
    query UserReports($userId: Int!) {
      reportData {
        reports(userID: $userId, limit: 100) {
          data { code title startTime endTime }
        }
      }
    }
  `, { userId });
  return data.reportData.reports.data;
}

export async function fetchWarcraftLogsReport(reportCodeOrUrl, token) {
  const parsed = reportCodeOrUrl.includes("warcraftlogs.com")
    ? parseWarcraftLogsReportUrl(reportCodeOrUrl)
    : { reportCode: reportCodeOrUrl.trim(), url: `https://www.warcraftlogs.com/reports/${reportCodeOrUrl.trim()}` };

  const data = await graphqlRequest(token, `
    query ReportOverview($code: String!) {
      reportData {
        report(code: $code) {
          code title startTime endTime
          fights {
            id name encounterID difficulty kill
            lastPhase lastPhaseAsAbsoluteIndex
            startTime endTime bossPercentage
          }
          masterData {
            abilities { gameID name }
            actors(type: "Player") { id name subType }
          }
        }
      }
    }
  `, { code: parsed.reportCode });

  return { parsed, raw: data.reportData.report };
}


// Lightweight fetch — only fight IDs + phase fields, no tables or events.
export async function fetchFightPhases(reportCode, token) {
  const data = await graphqlRequest(token, `
    query FightPhases($code: String!) {
      reportData {
        report(code: $code) {
          fights {
            id
            lastPhaseAsAbsoluteIndex
            lastPhase
          }
        }
      }
    }
  `, { code: reportCode });
  return data.reportData.report?.fights || [];
}

// Fetch raw death events for a single fight — used to explore position data.
// WoW 10.x+ logs include x/y coords on each event; we log everything raw so
// we can see exactly which fields WCL returns before building a heatmap.
// Fetch the first N death positions for a single fight.
// Returns [{ playerId, x, y, killAbilityId, timestamp, gapMs }] (playerId via normalizer).
// Strategy: get death events + all DamageTaken events with includeResources,
// then locally find the last damage event ≤ death.timestamp targeting that player.
export async function fetchFightDeathPositions(reportCode, fightId, token, { limit = 5, normalizePlayerId } = {}) {
  // 1) Deaths + actors
  const meta = await graphqlRequest(token, `
    query DeathsMeta($code: String!, $fightIDs: [Int]) {
      reportData {
        report(code: $code) {
          masterData { actors(type: "Player") { id name } }
          deaths: events(dataType: Deaths, fightIDs: $fightIDs, limit: 500, useActorIDs: true) { data }
        }
      }
    }
  `, { code: reportCode, fightIDs: [fightId] });

  const actors = meta.reportData.report.masterData?.actors || [];
  const deaths = (meta.reportData.report.deaths?.data || [])
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, limit);

  if (!deaths.length) return [];

  const actorIdToPlayerId = new Map(
    actors.map((a) => [a.id, normalizePlayerId ? normalizePlayerId(a.name) : a.name])
  );

  // 2) DamageTaken (paginated) with includeResources
  const damageEvents = [];
  let nextStart = null;
  let pages = 0;
  do {
    const page = await graphqlRequest(token, `
      query DmgPage($code: String!, $fightIDs: [Int], $startTime: Float) {
        reportData {
          report(code: $code) {
            events(
              dataType: DamageTaken
              fightIDs: $fightIDs
              limit: 10000
              useActorIDs: true
              includeResources: true
              startTime: $startTime
            ) { data nextPageTimestamp }
          }
        }
      }
    `, { code: reportCode, fightIDs: [fightId], startTime: nextStart });
    damageEvents.push(...(page.reportData.report.events?.data || []));
    nextStart = page.reportData.report.events?.nextPageTimestamp ?? null;
    pages++;
  } while (nextStart != null && pages < 20);

  // 3) Index damage events by target with position, sorted by timestamp
  const byTarget = new Map();
  for (const e of damageEvents) {
    if (e.x == null || e.y == null) continue;
    if (!byTarget.has(e.targetID)) byTarget.set(e.targetID, []);
    byTarget.get(e.targetID).push(e);
  }
  for (const arr of byTarget.values()) arr.sort((a, b) => a.timestamp - b.timestamp);

  // 4) For each death, find last damage event ≤ death.timestamp for that target
  const result = [];
  for (const death of deaths) {
    const candidates = byTarget.get(death.targetID) || [];
    let match = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (candidates[i].timestamp <= death.timestamp) { match = candidates[i]; break; }
    }
    if (!match) continue;
    result.push({
      playerId      : actorIdToPlayerId.get(death.targetID) ?? null,
      x             : match.x,
      y             : match.y,
      killAbilityId : death.killingAbilityGameID ?? null,
      timestamp     : death.timestamp,
      gapMs         : death.timestamp - match.timestamp
    });
  }
  return result;
}

// (legacy) Single-fight debug fetch with raw event dumps. Still used by Lab button.
export async function fetchDeathPositions(reportCode, fightId, token) {
  // 1) Deaths + actor lookup (single query)
  const meta = await graphqlRequest(token, `
    query DeathsMeta($code: String!, $fightIDs: [Int]) {
      reportData {
        report(code: $code) {
          masterData { actors(type: "Player") { id name subType } }
          deaths: events(
            dataType: Deaths
            fightIDs: $fightIDs
            limit: 500
            useActorIDs: true
          ) { data }
        }
      }
    }
  `, { code: reportCode, fightIDs: [fightId] });

  const actors      = meta.reportData.report.masterData?.actors || [];
  const deathEvents = meta.reportData.report.deaths?.data || [];

  // 2) All DamageTaken events for the fight, paginated
  const damageEvents = [];
  let nextStart = null;
  let pages = 0;
  const MAX_PAGES = 20; // safety net — 20 * 10k events = 200k

  do {
    const page = await graphqlRequest(token, `
      query DmgPage($code: String!, $fightIDs: [Int], $startTime: Float) {
        reportData {
          report(code: $code) {
            events(
              dataType: DamageTaken
              fightIDs: $fightIDs
              limit: 10000
              useActorIDs: true
              includeResources: true
              startTime: $startTime
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `, { code: reportCode, fightIDs: [fightId], startTime: nextStart });

    const events = page.reportData.report.events?.data || [];
    damageEvents.push(...events);
    nextStart = page.reportData.report.events?.nextPageTimestamp ?? null;
    pages++;
  } while (nextStart != null && pages < MAX_PAGES);

  return { actors, deathEvents, damageEvents, pages };
}

export async function fetchFightDetails(reportCode, fightId, token, potionAuras = []) {
  const potionFilter = buildPotionFilter(potionAuras);
  const data = await graphqlRequest(token, `
    query FightDetails($code: String!, $fightIDs: [Int], $potionFilter: String) {
      reportData {
        report(code: $code) {
          deathTable: table(dataType: Deaths, fightIDs: $fightIDs)
          damageTakenTable: table(dataType: DamageTaken, fightIDs: $fightIDs)
          auraTable: table(dataType: Buffs, fightIDs: $fightIDs, viewOptions: 16)
          interruptTable: table(dataType: Interrupts, fightIDs: $fightIDs)
          dispelTable: table(dataType: Dispels, fightIDs: $fightIDs)
          deathEvents: events(dataType: Deaths, fightIDs: $fightIDs, limit: 1000) {
            data nextPageTimestamp
          }
          potionEvents: events(
            dataType: Buffs, fightIDs: $fightIDs,
            filterExpression: $potionFilter,
            limit: 10000, useActorIDs: true, useAbilityIDs: true
          ) {
            data nextPageTimestamp
          }
        }
      }
    }
  `, { code: reportCode, fightIDs: [fightId], potionFilter });

  return data.reportData.report;
}

function buildPotionFilter(potionAuras) {
  const names = potionAuras.map((n) => String(n).trim()).filter(Boolean);
  if (!names.length) return "false";
  return names.map((n) => `ability.name = "${n.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(" OR ");
}
