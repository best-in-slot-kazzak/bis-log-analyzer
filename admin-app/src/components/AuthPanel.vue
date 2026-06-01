<template>
  <details class="auth-panel" :open="!token">
    <summary class="sidebar-header clickable">
      <span>WarcraftLogs</span>
      <span class="auth-badge" :class="token ? 'authed' : 'unauthed'">
        {{ token ? (currentUser?.name || "Logged in") : "Not logged in" }}
      </span>
    </summary>

    <div class="auth-form">
      <label class="field">
        <span>Client ID</span>
        <input :value="oauth.clientId" @change="emitChange('clientId', $event.target.value)" placeholder="WCL OAuth client ID" autocomplete="off" />
      </label>

      <details class="nested-details">
        <summary>Client Secret (confidential clients only)</summary>
        <label class="field">
          <span>Client Secret</span>
          <input :value="oauth.clientSecret" type="password" @change="emitChange('clientSecret', $event.target.value)" placeholder="Stored locally in IndexedDB" />
        </label>
        <button class="btn-small" type="button" @click="$emit('test-client')">Test credentials</button>
      </details>

      <label class="field">
        <span>Redirect URI</span>
        <input :value="oauth.redirectUri" @change="emitChange('redirectUri', $event.target.value)" />
      </label>
      <button class="btn-small" type="button" @click="$emit('use-current-uri')">Use current origin</button>

      <div class="btn-row">
        <button class="btn-primary" type="button" @click="$emit('login', 'pkce')">Login (PKCE)</button>
        <button type="button" @click="$emit('login', 'secret')">Login (Secret)</button>
      </div>

      <button type="button" :disabled="!token" @click="$emit('load-reports')">
        Load my reports
      </button>

      <p class="hint">Use PKCE for a public WCL client. Use Secret only for confidential clients. Tokens are stored in IndexedDB only.</p>
    </div>
  </details>
</template>

<script setup>
const props = defineProps({
  oauth: { type: Object, required: true },
  token: { type: Object, default: null },
  currentUser: { type: Object, default: null }
});

const emit = defineEmits(["oauth-change", "login", "test-client", "load-reports", "use-current-uri"]);

function emitChange(field, value) {
  emit("oauth-change", { ...props.oauth, [field]: value });
}
</script>
