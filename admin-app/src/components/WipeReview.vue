<template>
  <div class="wipe-review">
    <div class="review-toolbar">
      <label class="field inline">
        <span>Report</span>
        <select v-model="selectedReportId">
          <option v-for="report in boss.reports" :key="report.id" :value="report.id">
            {{ report.name }} — {{ formatDate(report.startedAt) }} ({{ report.pulls.length }} pulls)
          </option>
        </select>
      </label>
      <a v-if="selectedReport" class="btn-link" :href="fullReportUrl" target="_blank" rel="noreferrer" title="Open full report in WarcraftLogs">
        Open report ↗
      </a>
    </div>

    <template v-if="selectedReport">
      <div class="pull-stats">
        <span>{{ selectedReport.pulls.length }} pulls</span>
        <span>{{ manualCount }} manually annotated</span>
        <span>{{ unknownCount }} unknown</span>
      </div>

      <div class="wipe-table-wrapper">
        <table class="wipe-table">
          <thead>
            <tr>
              <th>Fight</th>
              <th>Time</th>
              <th>Phase</th>
              <th>Boss HP</th>
              <th>Duration</th>
              <th>Wipe Reason</th>
              <th>Player</th>
              <th class="col-log"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="pull in selectedReport.pulls"
              :key="pull.id"
              :class="{ 'row-manual': pull.manualWipeReason, 'row-auto': !pull.manualWipeReason && pull.autoWipeReason }"
            >
              <td class="col-fight">
                <strong>#{{ pull.fightId }}</strong>
              </td>
              <td class="col-time">
                <small>{{ formatTime(pull.startedAt) }}</small>
              </td>
              <td class="col-phase">
                <span class="phase-pill" :title="`raw: ${pull.phase}`">{{ phaseLabel(pull.phase) }}</span>
              </td>
              <td class="col-hp">
                <span class="hp-pill" :class="hpClass(pull.bossHpPercent)">
                  {{ pull.bossHpPercent != null ? pull.bossHpPercent + "%" : "—" }}
                </span>
              </td>
              <td class="col-dur">
                <small>{{ formatDuration(pull.duration) }}</small>
              </td>
              <td class="col-reason">
                <div class="reason-cell">
                  <span class="reason-dot" :style="{ background: reasonColor(getPullReasonId(pull)) }"></span>
                  <select :value="getPullReasonId(pull)" @change="onReasonChange(pull, $event.target.value)">
                    <option v-for="reason in boss.wipeReasons" :key="reason.id" :value="reason.id">
                      {{ reason.label }}
                    </option>
                  </select>
                </div>
              </td>
              <td class="col-player">
                <select
                  :value="getPullPlayerId(pull)"
                  :disabled="getPullReasonId(pull) === UNKNOWN_REASON_ID"
                  :title="getPullReasonId(pull) === UNKNOWN_REASON_ID ? 'Select a reason first' : ''"
                  @change="onPlayerChange(pull, $event.target.value)"
                >
                  <option value="">— no player —</option>
                  <option v-for="player in players" :key="player.id" :value="player.id">
                    {{ player.name }}
                  </option>
                </select>
              </td>
              <td class="col-log">
                <a
                  class="btn-link log-link"
                  :href="fightUrl(pull)"
                  target="_blank"
                  rel="noreferrer"
                  title="Open this pull in WarcraftLogs"
                >
                  ↗ Log
                </a>
                <a
                  v-if="pullVodUrl(pull)"
                  class="btn-link vod-link"
                  :href="pullVodUrl(pull)"
                  target="_blank"
                  rel="noreferrer"
                  title="Diesen Pull im VOD öffnen"
                >
                  ▶ VOD
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <p v-else-if="!boss.reports.length" class="hint">Import reports first in the Reports tab.</p>
    <p v-else class="hint">Select a report above.</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { UNKNOWN_REASON_ID, phaseLabel as phaseLabelFn } from "@shared/schema.js";
import { buildFightUrl, buildReportUrl } from "@shared/report-url.js";
import { buildPullVodUrl, firstPullOf } from "@shared/vod.js";

const props = defineProps({
  boss: { type: Object, required: true },
  players: { type: Array, default: () => [] }
});

const emit = defineEmits(["set-pull-reason", "set-pull-player"]);

const selectedReportId = ref("");

watch(() => props.boss.id, () => {
  selectedReportId.value = props.boss.reports[0]?.id || "";
}, { immediate: true });

watch(() => props.boss.reports.length, () => {
  if (!props.boss.reports.some((r) => r.id === selectedReportId.value)) {
    selectedReportId.value = props.boss.reports[0]?.id || "";
  }
});

const selectedReport = computed(() => props.boss.reports.find((r) => r.id === selectedReportId.value));
const fullReportUrl = computed(() => selectedReport.value ? buildReportUrl(selectedReport.value.code) : "#");

const manualCount = computed(() => selectedReport.value?.pulls.filter((p) => p.manualWipeReason).length ?? 0);
const unknownCount = computed(() => selectedReport.value?.pulls.filter((p) => getPullReasonId(p) === UNKNOWN_REASON_ID).length ?? 0);

function fightUrl(pull) {
  return selectedReport.value ? buildFightUrl(selectedReport.value.code, pull.fightId) : "#";
}

const firstPull = computed(() => firstPullOf(selectedReport.value));

function pullVodUrl(pull) {
  if (!selectedReport.value?.vodUrl) return null;
  return buildPullVodUrl(selectedReport.value.vodUrl, pull, firstPull.value);
}

function getPullReasonId(pull) {
  return pull.manualWipeReason?.reasonId || pull.autoWipeReason?.reasonId || UNKNOWN_REASON_ID;
}

function getPullPlayerId(pull) {
  return pull.manualWipeReason?.playerId || pull.autoWipeReason?.playerId || "";
}

function reasonColor(reasonId) {
  return props.boss.wipeReasons.find((r) => r.id === reasonId)?.color || "#6b7280";
}

function onReasonChange(pull, reasonId) {
  emit("set-pull-reason", { pullId: pull.id, reportId: selectedReportId.value, reasonId });
  // Reason set to Unknown → clear any player assignment
  if (reasonId === UNKNOWN_REASON_ID) {
    emit("set-pull-player", { pullId: pull.id, reportId: selectedReportId.value, playerId: "" });
  }
}

function onPlayerChange(pull, playerId) {
  emit("set-pull-player", { pullId: pull.id, reportId: selectedReportId.value, playerId });
}

function phaseLabel(phase) {
  return phaseLabelFn(phase, props.boss.phaseMap);
}

function hpClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "hp-unknown";
  if (n <= 5) return "hp-legendary";
  if (n <= 15) return "hp-epic";
  if (n <= 30) return "hp-rare";
  if (n <= 50) return "hp-uncommon";
  return "hp-common";
}

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", { timeStyle: "short" }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(new Date(value));
}

function formatDuration(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
</script>
