<template>
  <div class="report-import">
    <div class="import-top">
      <section class="panel">
        <h3>Manual Import</h3>
        <label class="field">
          <span>Report URL or code</span>
          <input v-model="manualUrl" placeholder="https://www.warcraftlogs.com/reports/... or report code" @keydown.enter="triggerManual" />
        </label>
        <button type="button" :disabled="!token || importState.active || !manualUrl.trim()" @click="triggerManual">
          <span v-if="importState.active && lastAction === 'manual'" class="spinner"></span>
          Import
        </button>
      </section>

      <section v-if="availableReports.length" class="panel">
        <h3>From your WarcraftLogs account</h3>
        <div class="report-checklist">
          <label v-for="report in availableReports" :key="report.code" class="check-label">
            <input
              type="checkbox"
              :value="report.code"
              :checked="selectedReportCodes.includes(report.code)"
              @change="toggleCode(report.code)"
            />
            <span>
              <strong>{{ report.title || report.code }}</strong>
              <small>{{ report.code }} · {{ formatDate(report.startTime) }}</small>
            </span>
          </label>
        </div>
        <button
          type="button"
          :disabled="!selectedReportCodes.length || importState.active"
          @click="triggerSelected"
        >
          <span v-if="importState.active && lastAction === 'selected'" class="spinner"></span>
          Import selected ({{ selectedReportCodes.length }})
        </button>
      </section>
    </div>

    <div v-if="importState.active || importState.message" class="import-status" role="status">
      <div class="status-line">
        <span>{{ importState.message }}</span>
        <strong v-if="importState.total">{{ importState.current }}/{{ importState.total }}</strong>
      </div>
      <div v-if="importState.total" class="progress-track">
        <div class="progress-fill" :style="{ width: `${Math.round((importState.current / importState.total) * 100)}%` }"></div>
      </div>
    </div>

    <section class="panel imported-reports">
      <h3>Imported Reports</h3>
      <p v-if="!boss.reports.length" class="hint">No reports imported yet.</p>
      <div v-for="report in [...boss.reports].reverse()" :key="report.id" class="report-row">
        <div class="report-info">
          <strong>{{ report.name }}</strong>
          <small>{{ report.code }} · {{ report.pulls.length }} pulls · {{ formatDate(report.startedAt) }}</small>
          <label class="vod-field">
            <span>VOD (optional)</span>
            <input
              type="url"
              class="vod-input"
              :class="{ 'vod-invalid': report.vodUrl && !isValidVod(report.vodUrl) }"
              :value="report.vodUrl || ''"
              placeholder="https://www.twitch.tv/videos/123?t=00h28m25s  (Startzeit = erster Pull)"
              @change="onVodChange(report.id, $event.target.value)"
            />
            <small v-if="report.vodUrl && !isValidVod(report.vodUrl)" class="vod-warn">
              Keine gültige Twitch-VOD-URL.
            </small>
            <small v-else-if="report.vodUrl" class="vod-ok">
              ✓ Start bei {{ vodStartLabel(report.vodUrl) }} = erster Pull
            </small>
          </label>
        </div>
        <a class="btn-link" :href="reportUrl(report.code)" target="_blank" rel="noreferrer">↗</a>
        <button class="btn-small btn-danger" type="button" @click="$emit('remove-report', report.id)">Remove</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { buildReportUrl } from "@shared/report-url.js";
import { parseTwitchVod, formatTwitchTime } from "@shared/vod.js";

const props = defineProps({
  boss: { type: Object, required: true },
  token: { type: Object, default: null },
  availableReports: { type: Array, default: () => [] },
  importState: { type: Object, required: true },
  selectedReportCodes: { type: Array, default: () => [] }
});

const emit = defineEmits(["import-manual", "import-selected", "remove-report", "set-report-vod", "update:selected-report-codes"]);

function onVodChange(reportId, value) {
  emit("set-report-vod", { reportId, vodUrl: value.trim() });
}

function isValidVod(url) {
  return !!parseTwitchVod(url);
}

function vodStartLabel(url) {
  const parsed = parseTwitchVod(url);
  return parsed ? formatTwitchTime(parsed.startSeconds) : "";
}

const manualUrl = ref("");
const lastAction = ref("");

function triggerManual() {
  if (!manualUrl.value.trim() || !props.token || props.importState.active) return;
  lastAction.value = "manual";
  emit("import-manual", manualUrl.value.trim());
  manualUrl.value = "";
}

function triggerSelected() {
  lastAction.value = "selected";
  emit("import-selected");
}

function toggleCode(code) {
  const codes = [...props.selectedReportCodes];
  const i = codes.indexOf(code);
  if (i === -1) codes.push(code);
  else codes.splice(i, 1);
  emit("update:selected-report-codes", codes);
}

function reportUrl(code) {
  return buildReportUrl(code);
}

function formatDate(value) {
  if (!value) return "unknown";
  const ts = typeof value === "number" ? value : new Date(value).getTime();
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(ts);
}
</script>
