<template>
  <div class="admin-shell">
    <header class="topbar">
      <div class="topbar-brand">
        <span class="eyebrow">Local Admin</span>
        <h1>BISWCL</h1>
      </div>
      <div class="topbar-right">
        <span v-if="notice" class="notice-pill" :class="noticeType">{{ notice }}</span>
        <button class="btn-secondary" type="button" @click="cleanupPlayers">Clean up Players</button>
        <label class="topbar-check" title="Include death positions in exported data.js (adds size to the file)">
          <input type="checkbox" v-model="exportIncludeHeatmap" />
          heatmap data
        </label>
        <button class="btn-primary" type="button" @click="exportData">Export data.js</button>
      </div>
    </header>

    <div class="workspace">
      <aside class="sidebar">
        <AuthPanel
          :oauth="oauth"
          :token="token"
          :current-user="currentUser"
          @oauth-change="onOauthChange"
          @login="login"
          @test-client="testClient"
          @load-reports="loadReports"
          @use-current-uri="useCurrentRedirectUri"
        />

        <div class="sidebar-section">
          <div class="sidebar-header">
            <span>Bosses</span>
            <button class="icon-btn" type="button" title="Add boss" @click="addBoss">+</button>
          </div>
          <button
            v-for="boss in data.bosses"
            :key="boss.id"
            class="boss-item"
            :class="{ active: boss.id === selectedBossId }"
            type="button"
            @click="selectBoss(boss.id)"
          >
            <span>{{ boss.name }}</span>
            <small>{{ boss.difficulty }} · {{ totalPulls(boss) }} pulls</small>
          </button>
          <p v-if="!data.bosses.length" class="hint">No bosses yet.</p>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-header">
            <span>Players <small class="player-count">({{ data.players.length }})</small></span>
            <button class="icon-btn" type="button" :title="showPlayers ? 'Collapse' : 'Expand'" @click="showPlayers = !showPlayers">{{ showPlayers ? '▴' : '▾' }}</button>
          </div>
          <template v-if="showPlayers">
            <div v-if="!data.players.length" class="hint">No players yet.</div>
            <div v-for="player in data.players" :key="player.id" class="player-row">
              <span class="player-row-name">{{ player.name }}</span>
              <small class="player-class-tag">{{ player.class }}</small>
              <button class="icon-btn icon-btn-danger" type="button" title="Remove player" @click="removePlayer(player.id)">✕</button>
            </div>
          </template>
        </div>
      </aside>

      <main class="content">
        <template v-if="selectedBoss">
          <nav class="tab-nav">
            <button
              v-for="tab in TABS"
              :key="tab.id"
              class="tab-btn"
              :class="{ active: activeTab === tab.id }"
              type="button"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </nav>

          <div class="tab-content">
            <ReportImport
              v-if="activeTab === 'reports'"
              :boss="selectedBoss"
              :token="token"
              :available-reports="availableReports"
              :import-state="importState"
              :selected-report-codes="selectedReportCodes"
              @update:selected-report-codes="selectedReportCodes = $event"
              @import-manual="importManualReport"
              @import-selected="importSelectedReports"
              @remove-report="removeReport"
              @set-report-vod="setReportVod"
            />

            <WipeReview
              v-else-if="activeTab === 'review'"
              :boss="selectedBoss"
              :players="data.players"
              @set-pull-reason="setPullReason"
              @set-pull-player="setPullPlayer"
            />

            <BossConfig
              v-else-if="activeTab === 'config'"
              :boss="selectedBoss"
              :bosses="data.bosses"
              :players="data.players"
              :phases-patching="phasesPatching"
              @update="persistData"
              @add-reason="addReason"
              @delete-boss="deleteBoss"
              @patch-phases="patchPhases"
            />

            <div v-else-if="activeTab === 'lab'" class="lab-panel">
              <h2>🧪 Lab</h2>

              <section class="lab-section">
                <h3>Death Position Heatmap</h3>
                <p class="hint">
                  Fetches the first 5 death positions per pull across <strong>all reports</strong>
                  of this boss and persists them. The heatmap below renders them on the boss arena map.
                </p>
                <div class="lab-meta">
                  {{ allDeathPositions.length }} death positions stored ·
                  {{ selectedBoss?.reports.length || 0 }} reports ·
                  {{ selectedBoss?.reports.reduce((s, r) => s + r.pulls.length, 0) || 0 }} pulls
                </div>
                <div class="lab-row">
                  <button
                    class="btn-primary"
                    type="button"
                    :disabled="bulkPosFetching || !selectedBoss?.reports.length"
                    @click="bulkFetchDeathPositions"
                  >
                    {{ bulkPosFetching ? `Fetching ${bulkPosProgress.done}/${bulkPosProgress.total}…` : "Fetch death positions for all pulls" }}
                  </button>
                  <span v-if="bulkPosFetching" class="hint">{{ bulkPosProgress.message }}</span>
                </div>

                <div class="heatmap-controls">
                  <label class="field inline">
                    <span>Player</span>
                    <select v-model="heatmapPlayerFilter">
                      <option value="">All players</option>
                      <option v-for="p in data.players" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                  </label>
                  <label class="field inline">
                    <span>Phase</span>
                    <select v-model="heatmapPhaseFilter">
                      <option value="">All phases</option>
                      <option v-for="ph in (selectedBoss?.phaseMap || [])" :key="ph.id" :value="String(ph.id)">{{ ph.title }}</option>
                    </select>
                  </label>
                  <label class="field inline">
                    <span>Cell size (px)</span>
                    <input v-model.number="heatmapCellSize" type="range" min="4" max="64" step="2" style="width:140px" />
                    <small style="min-width:30px">{{ heatmapCellSize }}</small>
                  </label>
                  <label class="field inline" style="flex:1;min-width:300px">
                    <span>Map URL</span>
                    <input :value="heatmapMapUrl" @change="heatmapMapUrl = $event.target.value" type="text" />
                  </label>
                </div>

                <div class="heatmap-bounds">
                  <strong>Map bounds</strong>
                  <span class="hint">
                    <template v-if="heatmapPhaseFilter !== ''">
                      for <strong>{{ phaseTitle(parseInt(heatmapPhaseFilter)) }}</strong>
                      ·
                      {{ hasPhaseSpecificBounds ? "phase-specific override" : "fallback (default or auto)" }}
                    </template>
                    <template v-else>
                      default (used for any phase without its own override)
                      ·
                      {{ selectedBoss?.deathMapConfig?.mapBounds ? "manual" : "auto-detected" }}
                    </template>
                  </span>
                  <label class="field inline">
                    <span>minX</span>
                    <input type="number" :value="heatmapBounds?.minX ?? ''" @change="setMapBound('minX', $event.target.value)" />
                  </label>
                  <label class="field inline">
                    <span>maxX</span>
                    <input type="number" :value="heatmapBounds?.maxX ?? ''" @change="setMapBound('maxX', $event.target.value)" />
                  </label>
                  <label class="field inline">
                    <span>minY</span>
                    <input type="number" :value="heatmapBounds?.minY ?? ''" @change="setMapBound('minY', $event.target.value)" />
                  </label>
                  <label class="field inline">
                    <span>maxY</span>
                    <input type="number" :value="heatmapBounds?.maxY ?? ''" @change="setMapBound('maxY', $event.target.value)" />
                  </label>
                  <button class="btn-secondary btn-small" type="button" @click="resetMapBounds">Reset to auto</button>
                </div>

                <div class="heatmap-calib">
                  <div class="lab-row">
                    <button
                      class="btn-secondary btn-small"
                      type="button"
                      :class="{ active: calibMode }"
                      @click="startCalibration"
                    >
                      {{ calibMode ? "Cancel calibration" : "Calibrate (auto-pick 2 deaths)" }}
                    </button>
                    <button
                      v-if="calibMode"
                      class="btn-secondary btn-small"
                      type="button"
                      @click="repickCalibrationDeaths"
                    >
                      Re-pick (try another fight)
                    </button>
                    <button
                      v-if="calibMode"
                      class="btn-primary btn-small"
                      type="button"
                      :disabled="!canApplyCalibration"
                      @click="applyCalibration"
                    >
                      Apply calibration
                    </button>
                  </div>
                  <p v-if="calibMode" class="hint">
                    Open each WCL link, find the player's position at the listed timestamp in the replay,
                    then click that exact spot on the map below. Point #1 first (cyan), then #2 (magenta).
                  </p>
                  <div v-if="calibMode" class="calib-points">
                    <div
                      v-for="(p, i) in calibPoints"
                      :key="i"
                      class="calib-row"
                      :class="{ done: p.pixelX != null }"
                    >
                      <span class="calib-idx" :style="{ color: CALIB_COLORS[i] }">#{{ i + 1 }}</span>
                      <strong>{{ playerName(p.death.playerId) }}</strong>
                      <span class="hint">{{ phaseTitle(p.death.phase) }} · ts {{ p.death.timestamp }}</span>
                      <span class="hint">game ({{ (p.death.x / 100).toFixed(2) }}, {{ (p.death.y / 100).toFixed(2) }})</span>
                      <a :href="wclLinkFor(p.death)" target="_blank" rel="noreferrer" class="btn-link">Open in WCL ↗</a>
                      <span v-if="p.pixelX != null" class="calib-done">✓ clicked ({{ p.pixelX }}, {{ p.pixelY }})</span>
                      <span v-else class="hint">click on the map</span>
                    </div>
                  </div>
                </div>

                <div class="heatmap-stage">
                  <canvas
                    ref="heatmapCanvas"
                    width="800" height="800"
                    :style="{ cursor: calibMode ? 'crosshair' : 'default' }"
                    @click="onHeatmapClick"
                  ></canvas>
                  <div v-if="!filteredDeathPositions.length" class="heatmap-empty">
                    No death positions to display. Fetch data first or adjust filters.
                  </div>
                </div>
              </section>

              <section class="lab-section">
                <h3>Debug: Single-Fight Inspector</h3>
                <p class="hint">
                  Raw debug dump for the first pull of the first report — useful when investigating
                  what WCL returns for a specific fight. Output goes to the browser console.
                </p>
                <div class="lab-meta" v-if="labTarget">
                  Report <code>{{ labTarget.reportCode }}</code> · Fight #{{ labTarget.fightId }}
                </div>
                <p v-else class="hint">No reports imported for this boss yet.</p>
                <button
                  class="btn-secondary"
                  type="button"
                  :disabled="!labTarget || labFetching"
                  @click="fetchPositionData"
                >
                  {{ labFetching ? "Fetching…" : "Inspect first fight → Console" }}
                </button>
              </section>
            </div>
          </div>
        </template>

        <div v-else class="empty-state">
          <p>Select or add a boss in the sidebar to get started.</p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { normalizeReasonId, createNewBoss, ensureBossDefaults, UNKNOWN_REASON_ID } from "@shared/schema.js";
import { analyzePull } from "@shared/analyzers/index.js";
import { exportDataJs } from "@shared/export-data.js";
import { buildFightUrl } from "@shared/report-url.js";
import {
  createAuthorizationUrl, createCodeVerifier, createCodeChallenge,
  exchangeAuthorizationCode, fetchCurrentUser, fetchUserReports,
  fetchWarcraftLogsReport, fetchFightDetails, fetchFightPhases, fetchDeathPositions, fetchFightDeathPositions, testClientCredentials
} from "./services/wclApi.js";
import { normalizeBossPercent, normalizeFightDetails } from "./services/normalizeWcl.js";
import {
  getDashboardData, getOauthSettings, getOauthState, getOauthToken, getCodeVerifier,
  saveOauthSettings, saveOauthState, saveOauthToken, saveCodeVerifier, saveDashboardData
} from "./storage/db.js";
import { createInitialData, downloadText } from "./exporter.js";
import AuthPanel from "./components/AuthPanel.vue";
import ReportImport from "./components/ReportImport.vue";
import WipeReview from "./components/WipeReview.vue";
import BossConfig from "./components/BossConfig.vue";

const TABS = [
  { id: "reports", label: "Reports" },
  { id: "review", label: "Wipe Review" },
  { id: "config", label: "Config" },
  { id: "lab", label: "🧪 Lab" }
];

const data = reactive(createInitialData());
const oauth = reactive({ clientId: "", clientSecret: "", redirectUri: `${window.location.origin}/oauth/callback` });
const token = ref(null);
const currentUser = ref(null);
const availableReports = ref([]);
const selectedReportCodes = ref([]);
const selectedBossId = ref("");
const activeTab = ref("reports");
const notice = ref("");
const noticeType = ref("info");
const showPlayers = ref(false);
const phasesPatching = ref(false);
const labFetching = ref(false);
const exportIncludeHeatmap = ref(true);
const bulkPosFetching = ref(false);
const bulkPosProgress = reactive({ done: 0, total: 0, message: "" });
const heatmapPlayerFilter = ref("");
const heatmapPhaseFilter = ref("");
const heatmapCellSize = ref(16); // grid cell size in pixels
const importState = reactive({ active: false, message: "", current: 0, total: 0 });

const selectedBoss = computed(() => data.bosses.find((b) => b.id === selectedBossId.value));

// Lab: first available report + fight for the current boss
const labTarget = computed(() => {
  const report = selectedBoss.value?.reports?.[0];
  const pull   = report?.pulls?.[0];
  if (!report || !pull) return null;
  return { reportCode: report.code, fightId: pull.fightId };
});

watch(selectedBossId, () => { activeTab.value = "reports"; });

onMounted(async () => {
  Object.assign(oauth, await getOauthSettings());
  token.value = await getOauthToken();
  const stored = await getDashboardData();
  if (stored) {
    // Migrate boss configs through ensureBossDefaults so newly-added defaults
    // (e.g. new widgets, new config fields) appear on existing boss data.
    if (Array.isArray(stored.bosses)) {
      stored.bosses = stored.bosses.map((b) => ensureBossDefaults(b));
    }
    Object.assign(data, stored);
    await persistData(); // persist the migrated structure back
  } else {
    await persistData();
  }
  await handleOAuthCallback();
  if (token.value) await loadCurrentUser();
  if (data.bosses.length && !selectedBossId.value) selectedBossId.value = data.bosses[0].id;
});

async function persistData() {
  await saveDashboardData(JSON.parse(JSON.stringify(data)));
}

function setNotice(message, type = "info") {
  notice.value = message;
  noticeType.value = type;
  setTimeout(() => { if (notice.value === message) notice.value = ""; }, 4000);
}

async function onOauthChange(updated) {
  Object.assign(oauth, updated);
  await saveOauthSettings(JSON.parse(JSON.stringify(oauth)));
}

async function useCurrentRedirectUri() {
  oauth.redirectUri = `${window.location.origin}/oauth/callback`;
  await saveOauthSettings(JSON.parse(JSON.stringify(oauth)));
}

async function login(flow) {
  if (!oauth.clientId.trim() || !oauth.redirectUri.trim()) {
    setNotice("Add Client ID and Redirect URI first.", "error");
    return;
  }
  const state = crypto.randomUUID();
  const usePkce = flow === "pkce";
  const verifier = usePkce ? createCodeVerifier() : "";
  const challenge = usePkce ? await createCodeChallenge(verifier) : "";
  await saveOauthState(state);
  await saveCodeVerifier(verifier);
  const authUrl = createAuthorizationUrl({
    clientId: oauth.clientId.trim(),
    redirectUri: oauth.redirectUri.trim(),
    state,
    codeChallenge: challenge || null
  });
  await saveOauthSettings({ ...JSON.parse(JSON.stringify(oauth)), flow });
  window.location.href = authUrl;
}

async function testClient() {
  try {
    const result = await testClientCredentials({ clientId: oauth.clientId.trim(), clientSecret: oauth.clientSecret.trim() });
    setNotice(`Credentials valid. Token type: ${result.token_type || "unknown"}.`);
  } catch (err) {
    setNotice(err.message, "error");
  }
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code) return;
  const expectedState = await getOauthState();
  if (!expectedState || expectedState !== returnedState) {
    setNotice("OAuth state mismatch. Try logging in again.", "error");
    return;
  }
  try {
    const stored = await getOauthSettings();
    const usePkce = stored.flow === "pkce";
    const codeVerifier = usePkce ? await getCodeVerifier() : "";
    token.value = await exchangeAuthorizationCode({
      clientId: oauth.clientId.trim(),
      clientSecret: usePkce ? "" : oauth.clientSecret.trim(),
      code, codeVerifier, redirectUri: oauth.redirectUri.trim()
    });
    await saveOauthToken(token.value);
    window.history.replaceState({}, document.title, "/");
    setNotice("Login successful.");
  } catch (err) {
    setNotice(err.message, "error");
  }
}

async function loadCurrentUser() {
  try {
    currentUser.value = await fetchCurrentUser(token.value);
  } catch (err) {
    setNotice(err.message, "error");
  }
}

async function loadReports() {
  if (!token.value) { setNotice("Login first.", "error"); return; }
  if (!currentUser.value) await loadCurrentUser();
  try {
    availableReports.value = await fetchUserReports(token.value, currentUser.value.id);
    setNotice(`Loaded ${availableReports.value.length} reports.`);
  } catch (err) {
    setNotice(err.message, "error");
  }
}

function selectBoss(id) {
  selectedBossId.value = id;
}

function addBoss() {
  const boss = createNewBoss("", data.bosses.length);
  data.bosses.push(boss);
  selectedBossId.value = boss.id;
  persistData();
}

async function deleteBoss(bossId) {
  if (data.bosses.length <= 1) { setNotice("At least one boss must remain.", "error"); return; }
  const index = data.bosses.findIndex((b) => b.id === bossId);
  if (index === -1) return;
  data.bosses.splice(index, 1);
  selectedBossId.value = data.bosses[Math.max(0, index - 1)].id;
  await persistData();
}

function addReason({ bossId, label, color }) {
  const boss = data.bosses.find((b) => b.id === bossId);
  if (!boss || !label.trim()) return;
  const id = normalizeReasonId(label);
  if (boss.wipeReasons.some((r) => r.id === id)) { setNotice("Reason already exists.", "error"); return; }
  boss.wipeReasons.push({ id, label: label.trim(), color });
  persistData();
}

async function importManualReport(reportUrl) {
  if (!token.value) { setNotice("Login first.", "error"); return; }
  if (!selectedBoss.value) return;
  try {
    startImport("Loading report...", 0);
    await importReportCode(reportUrl);
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    finishImport();
  }
}

async function importSelectedReports() {
  if (!selectedReportCodes.value.length) { setNotice("Select at least one report.", "error"); return; }
  try {
    startImport("Importing...", selectedReportCodes.value.length);
    let imported = 0;
    for (const [i, code] of selectedReportCodes.value.entries()) {
      importState.current = i;
      importState.message = `Importing ${code}...`;
      if (await importReportCode(code, { quiet: true })) imported++;
    }
    setNotice(`Imported ${imported} report(s).`);
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    finishImport();
  }
}

async function importReportCode(codeOrUrl, options = {}) {
  const imported = await fetchWarcraftLogsReport(codeOrUrl.trim(), token.value);
  if (selectedBoss.value.reports.some((r) => r.code === imported.parsed.reportCode)) {
    if (!options.quiet) setNotice("Report already imported.");
    return false;
  }
  const normalized = await normalizeReport(imported.raw);
  if (!normalized.pulls.length) {
    setNotice("No matching Mythic wipes found. Check boss name or Encounter ID.", "error");
    return false;
  }
  selectedBoss.value.reports.push(normalized);
  // Only merge players who actually appeared in the imported boss pulls.
  // masterData.actors contains every player from every fight in the report
  // (trash, other bosses, etc.) — we must filter to avoid polluting the
  // global player list with people who never touched this boss.
  const participantIds = new Set(normalized.pulls.flatMap((p) => p.participants || []));
  const relevantActors = (imported.raw.masterData?.actors || []).filter(
    (actor) => actor.name && participantIds.has(normalizeReasonId(actor.name))
  );
  mergePlayers(relevantActors);
  await persistData();
  if (!options.quiet) setNotice(`Imported ${normalized.pulls.length} pull(s).`);
  return true;
}

async function normalizeReport(report) {
  const fights = filterBossFights(report.fights || []);
  resolveAbilityIds(report.masterData?.abilities || []);
  const wipes = fights.filter((f) => !f.kill);
  importState.total = Math.max(importState.total, wipes.length);
  const abilityNamesById = new Map((report.masterData?.abilities || []).map((a) => [String(a.gameID), a.name]));
  const actorIdToName = new Map((report.masterData?.actors || []).map((a) => [String(a.id), a.name]));
  const pulls = [];
  for (const [i, fight] of wipes.entries()) {
    importState.current = i + 1;
    importState.message = `Fight ${fight.id} (${i + 1}/${wipes.length})…`;
    const details = await fetchFightDetails(report.code, fight.id, token.value, selectedBoss.value.playerReviewConfig?.potionAuras || []);
    const normalizedDetails = remapPlayerIds(normalizeFightDetails(details, {
      potionAuras: selectedBoss.value.playerReviewConfig?.potionAuras || [],
      players: report.masterData?.actors || [],
      abilityNamesById
    }), actorIdToName);
    const pull = {
      id: `${report.code}-${fight.id}`,
      fightId: fight.id,
      encounterId: fight.encounterID || null,
      encounterName: fight.name || selectedBoss.value.name,
      startedAt: new Date(report.startTime + fight.startTime).toISOString(),
      duration: fight.endTime - fight.startTime,
      phase: fight.lastPhaseAsAbsoluteIndex != null ? fight.lastPhaseAsAbsoluteIndex : (fight.lastPhase ?? null),
      bossHpPercent: normalizeBossPercent(fight.bossPercentage),
      participants: normalizedDetails.participants,
      potionUsage: normalizedDetails.potionUsage,
      damageTaken: normalizedDetails.damageTaken,
      deaths: normalizedDetails.deaths,
      interrupts: normalizedDetails.interrupts,
      dispels: normalizedDetails.dispels,
      deathPositions: [] // populated by Lab → "Fetch death positions for boss"
    };
    pull.autoWipeReason = analyzePull(pull, selectedBoss.value);
    pulls.push(pull);
  }
  return { id: `report-${report.code}`, code: report.code, name: report.title || report.code, startedAt: new Date(report.startTime).toISOString(), pulls };
}

function filterBossFights(fights) {
  if (!selectedBoss.value) return [];
  const name = selectedBoss.value.name.trim().toLowerCase();
  const encId = Number(selectedBoss.value.encounterId);
  const hasEncId = Number.isFinite(encId) && encId > 0;

  const matching = fights.filter((f) => {
    if (hasEncId) {
      // Encounter ID is set: match by ID, skip difficulty check.
      // The encounter ID uniquely identifies the boss — no need to also
      // check difficulty here. Normal/Heroic of the same boss won't appear
      // in a pure progression log, and the user explicitly set this ID.
      return Number(f.encounterID) === encId;
    }
    // No encounter ID: require Mythic (difficulty 5) + name match.
    if (f.difficulty !== 5) return false;
    return String(f.name || "").trim().toLowerCase() === name;
  });

  // Auto-detect encounter ID from first match when not yet configured.
  if (!selectedBoss.value.encounterId && matching[0]?.encounterID) {
    selectedBoss.value.encounterId = matching[0].encounterID;
  }
  return matching;
}

function resolveAbilityIds(abilities) {
  const boss = selectedBoss.value;
  if (!boss?.playerReviewConfig?.abilities?.length) return;
  const byName = new Map(abilities.map((a) => [String(a.name).trim().toLowerCase(), a.gameID]));
  for (const ability of boss.playerReviewConfig.abilities) {
    if (Number.isFinite(ability.abilityId)) continue;
    const resolved = byName.get(String(ability.label).trim().toLowerCase());
    if (resolved) ability.abilityId = resolved;
  }
}

function normalizeWowClass(subType) {
  if (!subType) return subType;
  return subType.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function migratePlayerIdsInPlace() {
  // Normalize all existing player entries to name-slug IDs and remove duplicates.
  // Also fix playerId in all pull events using the stored playerName field.
  const seen = new Set();
  const nameToSlug = new Map();
  const clean = [];
  for (const p of data.players) {
    if (!p.name) continue;
    const slug = normalizeReasonId(p.name);
    if (seen.has(slug)) continue;
    nameToSlug.set(p.name.toLowerCase(), slug);
    clean.push({ ...p, id: slug, class: normalizeWowClass(p.class) });
    seen.add(slug);
  }
  data.players = clean;

  const fixArr = (arr) => { for (const e of arr || []) if (e.playerName) e.playerId = normalizeReasonId(e.playerName); };
  for (const boss of data.bosses || []) {
    for (const report of boss.reports || []) {
      for (const pull of report.pulls || []) {
        fixArr(pull.damageTaken);
        fixArr(pull.deaths);
        fixArr(pull.potionUsage);
        fixArr(pull.interrupts);
        fixArr(pull.dispels);
      }
    }
  }
}

function mergePlayers(actors) {
  migratePlayerIdsInPlace();
  const existingIds = new Set(data.players.map((p) => p.id));
  for (const actor of actors) {
    if (!actor.name) continue;
    const id = normalizeReasonId(actor.name);
    if (!existingIds.has(id)) {
      data.players.push({ id, name: actor.name, class: normalizeWowClass(actor.subType) });
      existingIds.add(id);
    }
  }
}

function remapPlayerIds(details, actorIdToName) {
  const toId = (playerId, playerName) => {
    const name = playerName || actorIdToName.get(String(playerId));
    return name ? normalizeReasonId(name) : String(playerId);
  };
  const remap = (arr) => (arr || []).map((e) => ({ ...e, playerId: toId(e.playerId, e.playerName) }));
  return {
    ...details,
    damageTaken: remap(details.damageTaken),
    deaths: remap(details.deaths),
    potionUsage: remap(details.potionUsage),
    interrupts: remap(details.interrupts),
    dispels: remap(details.dispels),
    participants: (details.participants || []).map((id) => {
      const name = actorIdToName.get(String(id));
      return name ? normalizeReasonId(name) : String(id);
    }),
  };
}


async function removeReport(reportId) {
  if (!selectedBoss.value) return;
  selectedBoss.value.reports = selectedBoss.value.reports.filter((r) => r.id !== reportId);
  await persistData();
}

async function setReportVod({ reportId, vodUrl }) {
  const report = selectedBoss.value?.reports.find((r) => r.id === reportId);
  if (!report) return;
  report.vodUrl = vodUrl || "";
  await persistData();
}

async function setPullReason({ pullId, reportId, reasonId }) {
  const report = selectedBoss.value?.reports.find((r) => r.id === reportId);
  const pull = report?.pulls.find((p) => p.id === pullId);
  if (!pull) return;
  pull.manualWipeReason = { reasonId, playerId: pull.manualWipeReason?.playerId || null, source: "manual" };
  await persistData();
}

async function setPullPlayer({ pullId, reportId, playerId }) {
  const report = selectedBoss.value?.reports.find((r) => r.id === reportId);
  const pull = report?.pulls.find((p) => p.id === pullId);
  if (!pull) return;
  const reasonId = pull.manualWipeReason?.reasonId || pull.autoWipeReason?.reasonId || UNKNOWN_REASON_ID;
  pull.manualWipeReason = { reasonId, playerId: playerId || null, source: "manual" };
  await persistData();
}

function startImport(message, total) {
  importState.active = true;
  importState.message = message;
  importState.current = 0;
  importState.total = total;
}

function finishImport() {
  importState.active = false;
  setTimeout(() => { if (!importState.active) { importState.message = ""; importState.current = 0; importState.total = 0; } }, 2000);
}


async function patchPhases(bossId) {
  const boss = data.bosses.find((b) => b.id === bossId);
  if (!boss?.reports.length) { setNotice("No reports to patch.", "error"); return; }
  if (!token.value) { setNotice("Login first.", "error"); return; }
  phasesPatching.value = true;
  let patched = 0, unchanged = 0, notFound = 0;
  try {
    for (const report of boss.reports) {
      importState.message = `Fetching phases for ${report.name}…`;
      const fights = await fetchFightPhases(report.code, token.value);
      // WCL returns fight IDs as numbers; fightId in pulls might be number or string after JSON round-trip
      const fightMap = new Map(fights.map((f) => [String(f.id), f]));
      for (const pull of report.pulls) {
        const fight = fightMap.get(String(pull.fightId));
        if (!fight) { notFound++; continue; }
        const newPhase = fight.lastPhaseAsAbsoluteIndex != null ? fight.lastPhaseAsAbsoluteIndex : (fight.lastPhase ?? null);
        if (newPhase !== pull.phase) { pull.phase = newPhase; patched++; }
        else unchanged++;
      }
    }
    await persistData();
    setNotice(`Patched: ${patched} · Unchanged: ${unchanged} · Not found: ${notFound}`);
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    phasesPatching.value = false;
    importState.message = "";
  }
}

function cleanupPlayers() {
  // Collect every player ID that is genuinely used somewhere in the data:
  // pull participants, manual wipe-reason assignments, and tank config.
  const usedIds = new Set();
  for (const boss of data.bosses) {
    for (const tankId of (boss.playerReviewConfig?.tanks || [])) usedIds.add(tankId);
    for (const report of boss.reports || []) {
      for (const pull of report.pulls || []) {
        for (const id of pull.participants || []) usedIds.add(id);
        if (pull.manualWipeReason?.playerId) usedIds.add(pull.manualWipeReason.playerId);
        if (pull.autoWipeReason?.playerId)   usedIds.add(pull.autoWipeReason.playerId);
      }
    }
  }
  const before = data.players.length;
  data.players = data.players.filter((p) => usedIds.has(p.id));
  const removed = before - data.players.length;
  if (removed === 0) { setNotice("Nothing to clean up — all players are referenced."); return; }
  if (!confirm(`Remove ${removed} unused player(s)? (${data.players.length} will remain)`)) return;
  persistData();
  setNotice(`Removed ${removed} player(s). ${data.players.length} remaining.`, "info");
}

async function removePlayer(playerId) {
  const player = data.players.find((p) => p.id === playerId);
  if (!player) return;
  if (!confirm(`Remove player "${player.name}"?`)) return;
  data.players = data.players.filter((p) => p.id !== playerId);
  await persistData();
  setNotice(`Removed ${player.name}.`);
}

function exportData() {
  const snapshot = JSON.parse(JSON.stringify(data));
  downloadText("data.js", exportDataJs(snapshot, { includeDeathPositions: exportIncludeHeatmap.value }));
}

function totalPulls(boss) {
  return (boss.reports || []).reduce((s, r) => s + r.pulls.length, 0);
}

// ── Lab ──────────────────────────────────────────────────────────────────────

async function fetchPositionData() {
  if (!labTarget.value || !token.value) return;
  const { reportCode, fightId } = labTarget.value;
  labFetching.value = true;
  try {
    const result = await fetchDeathPositions(reportCode, fightId, token.value);

    // Build actorId → name lookup for readable output
    const actorMap = new Map(result.actors.map((a) => [a.id, a.name]));

    console.group(`%c Death Positions — ${reportCode} / fight ${fightId}`, "font-weight:bold;color:#58a6ff");
    console.log(`Deaths: ${result.deathEvents.length} · DamageTaken events: ${result.damageEvents.length} (${result.pages} page${result.pages !== 1 ? "s" : ""})`);

    // ── Structural inspection ─────────────────────────────────────────────
    const sampleDmg = result.damageEvents[0];
    if (sampleDmg) {
      console.log("Keys on a DamageTaken event:", Object.keys(sampleDmg));
      console.log("Sample DamageTaken event (raw):", JSON.parse(JSON.stringify(sampleDmg)));
    }

    // Helper: extract x/y from wherever WCL puts it
    function getPos(e) {
      if (e.x != null && e.y != null) return { x: e.x, y: e.y, src: "top-level" };
      if (e.targetResources?.x != null) return { x: e.targetResources.x, y: e.targetResources.y, src: "targetResources" };
      if (e.sourceResources?.x != null) return { x: e.sourceResources.x, y: e.sourceResources.y, src: "sourceResources" };
      return null;
    }

    const dmgWithPos = result.damageEvents.filter(getPos);
    console.log(`DamageTaken events with position data: ${dmgWithPos.length} / ${result.damageEvents.length}`);

    if (!dmgWithPos.length) {
      console.warn("⚠️  No position data found in DamageTaken events — heatmap not possible from this log.");
      console.groupEnd();
      setNotice(`No position data in this log — see console`, "error");
      return;
    }

    // ── Death position matching ───────────────────────────────────────────
    // Index damage events by targetID for fast lookup, sorted by timestamp
    const byTarget = new Map();
    for (const e of result.damageEvents) {
      if (!getPos(e)) continue;
      if (!byTarget.has(e.targetID)) byTarget.set(e.targetID, []);
      byTarget.get(e.targetID).push(e);
    }
    for (const arr of byTarget.values()) arr.sort((a, b) => a.timestamp - b.timestamp);

    // For each death, find last damage event ≤ death.timestamp for same target
    const deathPositions = result.deathEvents.map((death) => {
      const candidates = byTarget.get(death.targetID) || [];
      let match = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (candidates[i].timestamp <= death.timestamp) { match = candidates[i]; break; }
      }
      const pos = match ? getPos(match) : null;
      return {
        player    : actorMap.get(death.targetID) ?? death.targetID,
        death_ts  : death.timestamp,
        killer    : actorMap.get(death.killerID) ?? death.killerID,
        kill_ability: death.killingAbilityGameID,
        match_ts  : match?.timestamp ?? null,
        gap_ms    : match ? (death.timestamp - match.timestamp) : null,
        x         : pos?.x ?? null,
        y         : pos?.y ?? null,
        pos_source: pos?.src ?? null,
      };
    });

    const found = deathPositions.filter((d) => d.x != null);
    console.log(`Matched positions for: ${found.length} / ${deathPositions.length} deaths`);
    console.table(deathPositions);
    console.groupEnd();

    setNotice(`${found.length}/${deathPositions.length} death positions matched — see console`);
  } catch (err) {
    console.error("fetchDeathPositions failed:", err);
    setNotice(err.message, "error");
  } finally {
    labFetching.value = false;
  }
}

// ── Bulk: fetch first-5 death positions for every pull of the selected boss ──
async function bulkFetchDeathPositions() {
  const boss = selectedBoss.value;
  if (!boss || !token.value) { setNotice("Login first or select a boss.", "error"); return; }
  const allPulls = boss.reports.flatMap((r) => r.pulls.map((p) => ({ report: r, pull: p })));
  if (!allPulls.length) { setNotice("No pulls to process.", "error"); return; }

  bulkPosFetching.value = true;
  bulkPosProgress.done = 0;
  bulkPosProgress.total = allPulls.length;
  bulkPosProgress.message = "";

  let processed = 0, matched = 0, errors = 0;
  try {
    for (const { report, pull } of allPulls) {
      bulkPosProgress.message = `Fight ${pull.fightId} in ${report.name}…`;
      try {
        const positions = await fetchFightDeathPositions(report.code, pull.fightId, token.value, {
          limit: 5,
          normalizePlayerId: normalizeReasonId
        });
        // Stamp phase from the pull (end-phase approximation)
        pull.deathPositions = positions.map((p) => ({ ...p, phase: pull.phase ?? null }));
        matched += positions.length;
      } catch (err) {
        console.error(`Failed for ${report.code} / fight ${pull.fightId}:`, err);
        errors++;
      }
      processed++;
      bulkPosProgress.done = processed;
    }
    await persistData();
    setNotice(`Done. ${matched} death positions stored across ${processed} pulls${errors ? ` (${errors} errors)` : ""}.`);
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    bulkPosFetching.value = false;
    bulkPosProgress.message = "";
  }
}

// ── Heatmap helpers ──────────────────────────────────────────────────────────
const allDeathPositions = computed(() => {
  const boss = selectedBoss.value;
  if (!boss) return [];
  return boss.reports.flatMap((r) => r.pulls.flatMap((p) => p.deathPositions || []));
});

const filteredDeathPositions = computed(() => {
  return allDeathPositions.value.filter((d) => {
    if (heatmapPlayerFilter.value && d.playerId !== heatmapPlayerFilter.value) return false;
    if (heatmapPhaseFilter.value !== "" && String(d.phase) !== heatmapPhaseFilter.value) return false;
    return true;
  });
});

// Raw API coords are centiYards. WCL Replay UI shows yards (÷100). We keep
// the raw values in storage but expose them as yards everywhere the user sees
// or types them (dropdown, bounds inputs, calibration) — so the numbers match
// what WCL displays 1:1.
const COORD_SCALE = 100;

// Auto-detected bounds in YARDS (display units) from ALL collected positions + 10% padding
const autoBounds = computed(() => {
  const pts = allDeathPositions.value;
  if (!pts.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const padX = (maxX - minX) * 0.1 || 1000;
  const padY = (maxY - minY) * 0.1 || 1000;
  return {
    minX: (minX - padX) / COORD_SCALE,
    maxX: (maxX + padX) / COORD_SCALE,
    minY: (minY - padY) / COORD_SCALE,
    maxY: (maxY + padY) / COORD_SCALE
  };
});

// Resolve bounds for a specific phase, falling back to default → auto
function boundsForPhase(phase) {
  const cfg = selectedBoss.value?.deathMapConfig;
  const key = String(phase);
  const perPhase = cfg?.mapBoundsByPhase?.[key];
  if (perPhase && Number.isFinite(perPhase.minX) && Number.isFinite(perPhase.maxX)
      && Number.isFinite(perPhase.minY) && Number.isFinite(perPhase.maxY)) return perPhase;
  const def = cfg?.mapBounds;
  if (def && Number.isFinite(def.minX) && Number.isFinite(def.maxX)
      && Number.isFinite(def.minY) && Number.isFinite(def.maxY)) return def;
  return autoBounds.value;
}

// Bounds shown in the bounds-editor: reflects currently filtered phase (or default)
const heatmapBounds = computed(() => {
  if (heatmapPhaseFilter.value !== "") {
    return boundsForPhase(parseInt(heatmapPhaseFilter.value, 10));
  }
  const def = selectedBoss.value?.deathMapConfig?.mapBounds;
  if (def && Number.isFinite(def.minX)) return def;
  return autoBounds.value;
});

// True if the current phase filter has a phase-specific override stored
const hasPhaseSpecificBounds = computed(() => {
  if (heatmapPhaseFilter.value === "") return false;
  const key = heatmapPhaseFilter.value;
  return !!selectedBoss.value?.deathMapConfig?.mapBoundsByPhase?.[key];
});

const heatmapMapUrl = computed({
  get: () => selectedBoss.value?.deathMapConfig?.imageUrl
    || "https://assets.rpglogs.com/img/warcraft/maps/2534-map.png",
  set: (v) => {
    if (!selectedBoss.value) return;
    if (!selectedBoss.value.deathMapConfig) selectedBoss.value.deathMapConfig = { imageUrl: "", mapBounds: null };
    selectedBoss.value.deathMapConfig.imageUrl = v;
    calibPoints.splice(0, calibPoints.length); // reset pending calibration; pixel coords are tied to canvas size
    persistData();
  }
});

function ensureDeathMapConfig() {
  if (!selectedBoss.value.deathMapConfig) {
    selectedBoss.value.deathMapConfig = { imageUrl: "", mapBounds: null, mapBoundsByPhase: {} };
  }
  if (!selectedBoss.value.deathMapConfig.mapBoundsByPhase) {
    selectedBoss.value.deathMapConfig.mapBoundsByPhase = {};
  }
}

function setMapBound(key, value) {
  if (!selectedBoss.value) return;
  ensureDeathMapConfig();
  const cfg = selectedBoss.value.deathMapConfig;
  const phaseKey = heatmapPhaseFilter.value;
  // Editing the active bounds (per-phase if phase filter is set, else default)
  const base = (phaseKey === "" ? cfg.mapBounds : cfg.mapBoundsByPhase[phaseKey])
    || { ...(heatmapBounds.value || { minX: 0, maxX: 0, minY: 0, maxY: 0 }) };
  const num = parseFloat(value);
  base[key] = Number.isFinite(num) ? num : null;
  const complete = ["minX", "maxX", "minY", "maxY"].every((k) => Number.isFinite(base[k]));
  if (phaseKey === "") {
    cfg.mapBounds = complete ? base : null;
  } else {
    if (complete) cfg.mapBoundsByPhase[phaseKey] = base;
    else delete cfg.mapBoundsByPhase[phaseKey];
  }
  persistData();
}

function resetMapBounds() {
  if (!selectedBoss.value?.deathMapConfig) return;
  const phaseKey = heatmapPhaseFilter.value;
  if (phaseKey === "") {
    selectedBoss.value.deathMapConfig.mapBounds = null;
  } else {
    delete selectedBoss.value.deathMapConfig.mapBoundsByPhase?.[phaseKey];
  }
  persistData();
}

// ── Click-calibration ────────────────────────────────────────────────────────
// Flow: tool picks 2 far-apart deaths from a single fight → user looks them up
// in WCL replay (link provided) → user clicks their positions on the map.
const CALIB_COLORS = ["#22d3ee", "#f472b6"]; // cyan + magenta — distinct on warm map tones
const calibPoints = reactive([]); // [{ death, pixelX, pixelY }]
const calibMode = ref(false);
const calibSkipFights = reactive(new Set()); // for "Re-pick" to cycle through fights

function playerName(playerId) {
  return data.players.find((p) => p.id === playerId)?.name || playerId;
}

function phaseTitle(phaseId) {
  return selectedBoss.value?.phaseMap?.find((p) => p.id === phaseId)?.title || `phase ${phaseId}`;
}

function wclLinkFor(death) {
  // WCL replay anchored to this death's timestamp (fight-relative ms)
  return `${buildFightUrl(death.reportCode, death.fightId)}&type=replay&start=${death.timestamp}&end=${death.timestamp + 1}`;
}

// Collect stored deaths with fight context, optionally respecting current filters
function collectDeathsWithContext(useFilters = false) {
  const boss = selectedBoss.value;
  if (!boss) return [];
  const out = [];
  for (const report of boss.reports) {
    for (const pull of report.pulls) {
      for (const dp of pull.deathPositions || []) {
        out.push({ ...dp, reportCode: report.code, fightId: pull.fightId, reportName: report.name });
      }
    }
  }
  if (useFilters) {
    return out.filter((d) => {
      if (heatmapPlayerFilter.value && d.playerId !== heatmapPlayerFilter.value) return false;
      if (heatmapPhaseFilter.value !== "" && String(d.phase) !== heatmapPhaseFilter.value) return false;
      return true;
    });
  }
  return out;
}

// Auto-pick: find the fight (not in skip set) with the widest-distance pair.
// Uses filtered deaths — so calibrating with phase "P3" picks from P3 deaths.
function pickCalibrationDeaths() {
  const all = collectDeathsWithContext(true);
  if (all.length < 2) return null;
  const byFight = new Map();
  for (const d of all) {
    const key = `${d.reportCode}__${d.fightId}`;
    if (calibSkipFights.has(key)) continue;
    if (!byFight.has(key)) byFight.set(key, []);
    byFight.get(key).push(d);
  }
  let best = null, bestDist = 0, bestKey = null;
  for (const [key, deaths] of byFight) {
    if (deaths.length < 2) continue;
    for (let i = 0; i < deaths.length; i++) {
      for (let j = i + 1; j < deaths.length; j++) {
        const dx = deaths[i].x - deaths[j].x;
        const dy = deaths[i].y - deaths[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > bestDist) { bestDist = dist; best = [deaths[i], deaths[j]]; bestKey = key; }
      }
    }
  }
  // Fallback: if we exhausted skip-list, reset and try again
  if (!best && calibSkipFights.size > 0) {
    calibSkipFights.clear();
    return pickCalibrationDeaths();
  }
  // Fallback: cross-fight pair if no single fight has 2+ deaths
  if (!best && all.length >= 2) best = [all[0], all[all.length - 1]];
  return { pair: best, fightKey: bestKey };
}

function startCalibration() {
  if (calibMode.value) {
    calibMode.value = false;
    calibPoints.splice(0, calibPoints.length);
    calibSkipFights.clear();
    return;
  }
  calibSkipFights.clear();
  const result = pickCalibrationDeaths();
  if (!result?.pair) {
    setNotice("Need at least 2 stored death positions to calibrate.", "error");
    return;
  }
  calibPoints.splice(0, calibPoints.length);
  calibPoints.push({ death: result.pair[0], pixelX: null, pixelY: null });
  calibPoints.push({ death: result.pair[1], pixelX: null, pixelY: null });
  calibMode.value = true;
}

function repickCalibrationDeaths() {
  if (!calibMode.value || !calibPoints.length) return;
  // Skip the current fight, try the next-best
  const current = calibPoints[0].death;
  calibSkipFights.add(`${current.reportCode}__${current.fightId}`);
  const result = pickCalibrationDeaths();
  if (!result?.pair) {
    setNotice("No more candidate fights — staying with current pair.", "info");
    return;
  }
  calibPoints[0] = { death: result.pair[0], pixelX: null, pixelY: null };
  calibPoints[1] = { death: result.pair[1], pixelX: null, pixelY: null };
  renderHeatmap();
}

function onHeatmapClick(e) {
  if (!calibMode.value || !calibPoints.length) return;
  const canvas = heatmapCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const px = Math.round((e.clientX - rect.left) / rect.width * canvas.width);
  const py = Math.round((e.clientY - rect.top)  / rect.height * canvas.height);
  // Fill the next un-clicked point; if all are filled, restart from the first
  const next = calibPoints.findIndex((p) => p.pixelX == null);
  if (next >= 0) {
    calibPoints[next].pixelX = px;
    calibPoints[next].pixelY = py;
  } else {
    calibPoints.forEach((p) => { p.pixelX = null; p.pixelY = null; });
    calibPoints[0].pixelX = px;
    calibPoints[0].pixelY = py;
  }
  renderHeatmap();
}

const canApplyCalibration = computed(() =>
  calibPoints.length === 2 && calibPoints.every((p) => p.pixelX != null && p.pixelY != null)
);

function applyCalibration() {
  if (!canApplyCalibration.value) return;
  const [a, b] = calibPoints;
  const canvas = heatmapCanvas.value;
  if (!canvas) return;
  const W = canvas.width, H = canvas.height;
  // Game coords in yards (scaled-down)
  const ax = a.death.x / COORD_SCALE, ay = a.death.y / COORD_SCALE;
  const bx = b.death.x / COORD_SCALE, by = b.death.y / COORD_SCALE;
  // Linear inverse: pixel = (game - min) * (W / (max - min))
  // From two known (pixel, game) pairs we solve for min and (max - min):
  //   slope_x = (a.pixelX - b.pixelX) / (ax - bx)   (pixels per yard)
  //   minX    = ax - a.pixelX / slope_x
  //   maxX    = minX + W / slope_x
  if (ax === bx || ay === by) {
    setNotice("The two picked deaths share an axis value — can't calibrate. Re-pick.", "error");
    return;
  }
  const sx = (a.pixelX - b.pixelX) / (ax - bx);
  const minX = ax - a.pixelX / sx;
  const maxX = minX + W / sx;
  const sy = (a.pixelY - b.pixelY) / (ay - by);
  const minY = ay - a.pixelY / sy;
  const maxY = minY + H / sy;
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    setNotice("Calibration math failed — try a different pair.", "error");
    return;
  }
  ensureDeathMapConfig();
  const cfg = selectedBoss.value.deathMapConfig;
  const newBounds = { minX, maxX, minY, maxY };
  const phaseKey = heatmapPhaseFilter.value;
  if (phaseKey === "") {
    cfg.mapBounds = newBounds;
    setNotice("Default bounds calibrated.");
  } else {
    cfg.mapBoundsByPhase[phaseKey] = newBounds;
    setNotice(`Bounds calibrated for phase ${phaseTitle(parseInt(phaseKey, 10))}.`);
  }
  persistData();
  calibMode.value = false;
  calibPoints.splice(0, calibPoints.length);
  calibSkipFights.clear();
}

const heatmapCanvas = ref(null);
let heatmapMapImage = null;

async function renderHeatmap() {
  const canvas = heatmapCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Background map — fit canvas to image's aspect ratio (cap longest side)
  const MAX_SIZE = 2048;
  let imageLoaded = false;
  try {
    if (!heatmapMapImage || heatmapMapImage.src !== heatmapMapUrl.value) {
      heatmapMapImage = await loadImage(heatmapMapUrl.value);
    }
    const nw = heatmapMapImage.naturalWidth;
    const nh = heatmapMapImage.naturalHeight;
    if (nw >= nh) {
      canvas.width  = Math.min(MAX_SIZE, nw);
      canvas.height = Math.round(canvas.width * nh / nw);
    } else {
      canvas.height = Math.min(MAX_SIZE, nh);
      canvas.width  = Math.round(canvas.height * nw / nh);
    }
    imageLoaded = true;
  } catch {
    // Fall back to a square placeholder
    canvas.width = 800;
    canvas.height = 800;
  }

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (imageLoaded) {
    ctx.drawImage(heatmapMapImage, 0, 0, W, H);
  } else {
    ctx.fillStyle = "#21262d";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#7d8590";
    ctx.font = "13px sans-serif";
    ctx.fillText("Map image failed to load", 12, 24);
  }

  const deaths = filteredDeathPositions.value;
  if (!deaths.length) return;

  // Compute per-death pixel positions using each death's phase-specific bounds.
  // Skip deaths for which no bounds are resolvable.
  const points = [];
  for (const d of deaths) {
    const b = boundsForPhase(d.phase);
    if (!b) continue;
    const px = (d.x / COORD_SCALE - b.minX) / (b.maxX - b.minX) * W;
    const py = (d.y / COORD_SCALE - b.minY) / (b.maxY - b.minY) * H;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    points.push({ px, py });
  }
  if (!points.length) return;

  // Pixel-grid heatmap: bin deaths into cells, color by count
  const cellSize = Math.max(2, heatmapCellSize.value);
  const cols = Math.ceil(W / cellSize);
  const rows = Math.ceil(H / cellSize);
  const grid = new Uint32Array(cols * rows);
  for (const p of points) {
    const cx = Math.floor(p.px / cellSize);
    const cy = Math.floor(p.py / cellSize);
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
    grid[cy * cols + cx]++;
  }
  let maxCount = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] > maxCount) maxCount = grid[i];
  // Floor max so single-death cells are still meaningful in sparse data
  const effectiveMax = Math.max(maxCount, 4);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const count = grid[cy * cols + cx];
      if (count === 0) continue;
      const t = Math.min(1, count / effectiveMax);
      // Yellow (255,255,0) → Orange → Red (255,0,0)
      const g = Math.round(255 * Math.max(0, 1 - t * 1.5));
      const a = 0.35 + 0.55 * t;
      ctx.fillStyle = `rgba(255, ${g}, 0, ${a})`;
      ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
    }
  }

  // Calibration markers (color-coded per point, matched to UI list)
  if (calibMode.value && calibPoints.length) {
    ctx.lineWidth = 2.5;
    ctx.font = "bold 16px sans-serif";
    calibPoints.forEach((p, i) => {
      if (p.pixelX == null) return;
      const color = CALIB_COLORS[i] || "#22d3ee";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p.pixelX - 12, p.pixelY); ctx.lineTo(p.pixelX + 12, p.pixelY);
      ctx.moveTo(p.pixelX, p.pixelY - 12); ctx.lineTo(p.pixelX, p.pixelY + 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.pixelX, p.pixelY, 8, 0, Math.PI * 2);
      ctx.stroke();
      // Number badge
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(p.pixelX + 12, p.pixelY - 22, 24, 20);
      ctx.fillStyle = color;
      ctx.fillText(`#${i + 1}`, p.pixelX + 16, p.pixelY - 7);
    });
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Re-render whenever data, filters, bounds, calibration state or cell size change
watch([filteredDeathPositions, heatmapMapUrl, heatmapBounds, calibPoints, calibMode, heatmapCellSize], () => {
  if (activeTab.value === "lab") requestAnimationFrame(renderHeatmap);
}, { deep: true });
watch(activeTab, (tab) => {
  if (tab === "lab") requestAnimationFrame(renderHeatmap);
});
</script>
