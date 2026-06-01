const DB_NAME = "biswcl";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("keyval")) {
        db.createObjectStore("keyval");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function get(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keyval", "readonly");
    const request = tx.objectStore("keyval").get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function set(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keyval", "readwrite");
    tx.objectStore("keyval").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const getDashboardData = () => get("dashboardData");
export const saveDashboardData = (data) => set("dashboardData", data);

export const getOauthSettings = async () => (await get("oauthSettings")) || {};
export const saveOauthSettings = (settings) => set("oauthSettings", settings);

export const getOauthToken = () => get("oauthToken");
export const saveOauthToken = (token) => set("oauthToken", token);

export const getOauthState = () => get("oauthState");
export const saveOauthState = (state) => set("oauthState", state);

export const getCodeVerifier = () => get("codeVerifier");
export const saveCodeVerifier = (verifier) => set("codeVerifier", verifier);
