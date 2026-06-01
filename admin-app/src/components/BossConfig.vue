<template>
  <div class="boss-config">
    <div class="config-header">
      <h2>{{ boss.name }} — Config</h2>
      <button class="btn-danger" type="button" @click="confirmDelete">Delete Boss</button>
    </div>

    <section class="config-section">
      <h3>Boss Details</h3>
      <div class="config-grid">
        <label class="field">
          <span>Name</span>
          <input v-model="boss.name" @change="$emit('update')" />
        </label>
        <label class="field">
          <span>Encounter ID</span>
          <input v-model.number="boss.encounterId" type="number" placeholder="Auto-detected on first import" @change="$emit('update')" />
        </label>
        <label class="field">
          <span>Boss image URL</span>
          <input v-model="boss.imageUrl" placeholder="https://..." @change="$emit('update')" />
        </label>
        <label class="field">
          <span>Difficulty</span>
          <input :value="boss.difficulty" disabled />
        </label>
      </div>
    </section>

    <section class="config-section split">
      <div>
        <h3>Wipe Reasons</h3>
        <form class="inline-form" @submit.prevent="addReason">
          <input v-model="newLabel" placeholder="Reason name" required />
          <input v-model="newColor" type="color" />
          <button type="submit">Add</button>
        </form>
        <div class="reason-list">
          <div v-for="reason in boss.wipeReasons" :key="reason.id" class="reason-row">
            <span class="color-swatch" :style="{ background: reason.color }"></span>
            <input v-model="reason.label" :disabled="reason.id === 'unknown'" @change="$emit('update')" />
            <input v-model="reason.color" type="color" :disabled="reason.id === 'unknown'" @change="$emit('update')" />
            <button v-if="reason.id !== 'unknown'" class="icon-btn" type="button" title="Remove" @click="removeReason(reason.id)">✕</button>
          </div>
        </div>
      </div>

      <div>
        <h3>Widgets</h3>
        <p class="hint">Enable/disable and reorder widgets on the public dashboard.</p>
        <div class="widget-list">
          <div v-for="(widget, index) in sortedWidgets" :key="widget.id" class="widget-row">
            <label class="check-label">
              <input type="checkbox" :checked="widget.enabled" @change="toggleWidget(widget.id)" />
              <span>{{ widget.title }}</span>
            </label>
            <div class="order-btns">
              <button class="icon-btn" type="button" :disabled="index === 0" title="Move up" @click="moveWidget(widget.id, -1)">↑</button>
              <button class="icon-btn" type="button" :disabled="index === sortedWidgets.length - 1" title="Move down" @click="moveWidget(widget.id, 1)">↓</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="config-section split">
      <div>
        <h3>Player Review — Tracked Abilities</h3>
        <p class="hint">One ability per line. Use <code>Name | ID</code> to pin the game ID. IDs are resolved automatically on import.</p>
        <textarea v-model="abilityText" rows="7" @input="saveAbilities"></textarea>
      </div>
      <div>
        <h3>Tanks</h3>
        <p class="hint">Marked players are hidden by default in the Player Comparison charts on the public dashboard.</p>
        <div class="player-check-list">
          <label v-for="player in players" :key="player.id" class="player-check-row">
            <input
              type="checkbox"
              :checked="(boss.playerReviewConfig?.tanks || []).includes(player.id)"
              @change="toggleTank(player.id)"
            />
            <span>{{ player.name }}</span>
            <small class="player-class-tag">{{ player.class }}</small>
          </label>
        </div>
      </div>
    </section>

    <section class="config-section split">
      <div>
        <h3>Phase Labels</h3>
        <p class="hint">One phase per line in fight order. Lines starting with <code>I</code> are treated as intermissions.<br>Example: <code>P1</code>, <code>I1</code>, <code>P2</code>, <code>P3</code></p>
        <textarea v-model="phaseText" rows="5" @input="savePhases"></textarea>
        <div style="margin-top:8px">
          <button
            type="button"
            class="btn-secondary btn-small"
            :disabled="!boss.reports.length || phasesPatching"
            title="Re-fetch lastPhaseAsAbsoluteIndex for all existing pulls without full re-import"
            @click="$emit('patch-phases', boss.id)"
          >{{ phasesPatching ? 'Patching…' : 'Patch Phase Data' }}</button>
          <span class="hint" style="margin-left:8px">Fixes phase labels without re-importing reports</span>
        </div>
      </div>
    </section>

    <section class="config-section">
      <h3>Death Heatmap</h3>
      <p class="hint">
        Controls the public-dashboard Death Heatmap widget. Map bounds / calibration
        are managed in the Lab tab.
      </p>
      <div class="config-grid">
        <label class="field">
          <span>Map image URL</span>
          <input
            :value="boss.deathMapConfig?.imageUrl || ''"
            @change="updateMapImage($event.target.value)"
            placeholder="https://..."
          />
        </label>
      </div>
      <div>
        <p class="hint">
          Phases visible in the public filter dropdown.
          <strong>None checked = show all phases</strong>.
        </p>
        <div class="player-check-list">
          <label v-for="phase in (boss.phaseMap || [])" :key="phase.id" class="player-check-row">
            <input
              type="checkbox"
              :checked="(boss.deathMapConfig?.publicPhases || []).includes(phase.id)"
              @change="togglePublicPhase(phase.id)"
            />
            <span>{{ phase.title }}</span>
          </label>
          <p v-if="!boss.phaseMap?.length" class="hint">Configure phases first in the section above.</p>
        </div>
      </div>
    </section>

    <section class="config-section split">
      <div>
        <h3>Potion Aura Names</h3>
        <p class="hint">One aura name per line as shown in WarcraftLogs Buffs data (e.g. <em>Tempered Potion</em>).</p>
        <textarea v-model="potionText" rows="3" @input="savePotions"></textarea>
        <h3 style="margin-top:14px">Potion Windows</h3>
        <p class="hint">One window per line: <code>Seconds | Label</code>. A pot is expected once the fight reaches that many seconds.<br>Example: <code>0 | Opener</code> and <code>370 | ~6 min</code></p>
        <textarea v-model="potionWindowText" rows="3" @input="savePotionWindows"></textarea>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { normalizeReasonId } from "@shared/schema.js";

const props = defineProps({
  boss: { type: Object, required: true },
  bosses: { type: Array, required: true },
  players: { type: Array, default: () => [] },
  phasesPatching: { type: Boolean, default: false }
});

const emit = defineEmits(["update", "add-reason", "delete-boss", "patch-phases"]);

const newLabel = ref("");
const newColor = ref("#60a5fa");
const abilityText = ref("");
const potionText = ref("");
const potionWindowText = ref("");
const phaseText = ref("");

const sortedWidgets = computed(() =>
  [...(props.boss.widgets || [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
);

watch(() => props.boss.id, sync, { immediate: true });

function sync() {
  abilityText.value = (props.boss.playerReviewConfig?.abilities || [])
    .map((a) => Number.isFinite(a.abilityId) ? `${a.label} | ${a.abilityId}` : a.label)
    .join("\n");
  potionText.value = (props.boss.playerReviewConfig?.potionAuras || []).join("\n");
  potionWindowText.value = (props.boss.playerReviewConfig?.potionWindows || [])
    .map((w) => `${w.afterSeconds ?? 0} | ${w.label || ""}`.trimEnd())
    .join("\n");
  phaseText.value = (props.boss.phaseMap || []).map((p) => p.title).join("\n");
}

function savePhases() {
  const lines = phaseText.value.split("\n").map((l) => l.trim()).filter(Boolean);
  props.boss.phaseMap = lines.map((title, i) => ({
    id: i,
    title,
    isIntermission: title.toUpperCase().startsWith("I")
  }));
  emit("update");
}

function addReason() {
  if (!newLabel.value.trim()) return;
  emit("add-reason", { bossId: props.boss.id, label: newLabel.value.trim(), color: newColor.value });
  newLabel.value = "";
  newColor.value = "#60a5fa";
}

function removeReason(reasonId) {
  const index = props.boss.wipeReasons.findIndex((r) => r.id === reasonId);
  if (index !== -1) { props.boss.wipeReasons.splice(index, 1); emit("update"); }
}

function toggleWidget(widgetId) {
  const w = props.boss.widgets.find((w) => w.id === widgetId);
  if (w) { w.enabled = !w.enabled; emit("update"); }
}

function moveWidget(widgetId, direction) {
  const sorted = [...sortedWidgets.value];
  const index = sorted.findIndex((w) => w.id === widgetId);
  const target = index + direction;
  if (target < 0 || target >= sorted.length) return;
  [sorted[index].order, sorted[target].order] = [sorted[target].order, sorted[index].order];
  for (const w of props.boss.widgets) {
    const updated = sorted.find((s) => s.id === w.id);
    if (updated) w.order = updated.order;
  }
  emit("update");
}

function saveAbilities() {
  if (!props.boss.playerReviewConfig) props.boss.playerReviewConfig = {};
  props.boss.playerReviewConfig.abilities = abilityText.value
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const [label, rawId] = line.split("|").map((p) => p.trim());
      const numericId = rawId ? Number(rawId) : NaN;
      return { id: normalizeReasonId(label || rawId), label: label || rawId, abilityId: Number.isFinite(numericId) ? numericId : null };
    })
    .filter((a) => a.label);
  emit("update");
}

function savePotions() {
  if (!props.boss.playerReviewConfig) props.boss.playerReviewConfig = {};
  props.boss.playerReviewConfig.potionAuras = potionText.value.split("\n").map((l) => l.trim()).filter(Boolean);
  emit("update");
}

function savePotionWindows() {
  if (!props.boss.playerReviewConfig) props.boss.playerReviewConfig = {};
  props.boss.playerReviewConfig.potionWindows = potionWindowText.value
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const [secStr, ...rest] = line.split("|").map((p) => p.trim());
      return { afterSeconds: Math.max(0, parseInt(secStr) || 0), label: rest.join("|").trim() };
    });
  emit("update");
}

function toggleTank(playerId) {
  if (!props.boss.playerReviewConfig) props.boss.playerReviewConfig = {};
  if (!props.boss.playerReviewConfig.tanks) props.boss.playerReviewConfig.tanks = [];
  const idx = props.boss.playerReviewConfig.tanks.indexOf(playerId);
  if (idx === -1) props.boss.playerReviewConfig.tanks.push(playerId);
  else props.boss.playerReviewConfig.tanks.splice(idx, 1);
  emit("update");
}

function ensureDeathMapConfig() {
  if (!props.boss.deathMapConfig) {
    props.boss.deathMapConfig = { imageUrl: "", mapBounds: null, mapBoundsByPhase: {}, publicPhases: [] };
  }
  if (!props.boss.deathMapConfig.publicPhases) props.boss.deathMapConfig.publicPhases = [];
}

function updateMapImage(value) {
  ensureDeathMapConfig();
  props.boss.deathMapConfig.imageUrl = value;
  emit("update");
}

function togglePublicPhase(phaseId) {
  ensureDeathMapConfig();
  const list = props.boss.deathMapConfig.publicPhases;
  const idx = list.indexOf(phaseId);
  if (idx === -1) list.push(phaseId);
  else list.splice(idx, 1);
  emit("update");
}

function confirmDelete() {
  if (props.bosses.length <= 1) return;
  if (confirm(`Delete boss "${props.boss.name}"? All imported reports will be lost.`)) {
    emit("delete-boss", props.boss.id);
  }
}
</script>
