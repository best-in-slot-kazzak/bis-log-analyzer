import { createEmptyDashboardData, createNewBoss } from "@shared/schema.js";

export function createInitialData() {
  const data = createEmptyDashboardData();
  data.bosses.push(createNewBoss("Lura", 0));
  return data;
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
