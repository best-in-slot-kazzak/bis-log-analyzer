export function renderTimeline(container, boss, onRangeChange) {
  const reports = [...(boss.reports || [])]
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  if (!reports.length) {
    container.innerHTML = `<div class="tl-wrap"><span class="tl-empty-msg">No reports imported.</span></div>`;
    onRangeChange([]);
    return;
  }

  if (reports.length === 1) {
    const r = reports[0];
    container.innerHTML = `
      <div class="tl-wrap">
        <div class="tl-single">
          <span class="tl-single-dot"></span>
          <span>${r.name}</span>
          <span class="tl-single-meta">${formatDate(r.startedAt)} · ${r.pulls.length} pulls</span>
        </div>
      </div>`;
    onRangeChange(reports);
    return;
  }

  // ── Multi-report timeline ────────────────────────────────────────────────
  const n = reports.length;
  let leftIdx = 0;
  let rightIdx = n - 1;

  function pct(i) { return i / (n - 1) * 100; }

  container.innerHTML = `
    <div class="tl-wrap">
      <div class="tl-track-area">
        <div class="tl-track" id="tl-track">
          <div class="tl-track-bg"></div>
          <div class="tl-fill" id="tl-fill"></div>
          ${reports.map((r, i) => `
            <div class="tl-marker active" style="left:${pct(i)}%" data-i="${i}"
                 title="${r.name}&#10;${r.pulls.length} pulls">
              <div class="tl-marker-dot"></div>
              <div class="tl-marker-label">${formatDate(r.startedAt)}</div>
            </div>`).join("")}
          <div class="tl-handle" id="tl-hl" style="left:${pct(0)}%"></div>
          <div class="tl-handle" id="tl-hr" style="left:${pct(n - 1)}%"></div>
        </div>
      </div>
      <div class="tl-summary" id="tl-summary"></div>
    </div>`;

  const fill    = container.querySelector("#tl-fill");
  const handleL = container.querySelector("#tl-hl");
  const handleR = container.querySelector("#tl-hr");
  const summary = container.querySelector("#tl-summary");
  const track   = container.querySelector("#tl-track");
  const markers = [...container.querySelectorAll(".tl-marker")];

  function updateVisuals() {
    const l = pct(leftIdx), r = pct(rightIdx);
    fill.style.left  = l + "%";
    fill.style.width = (r - l) + "%";
    handleL.style.left = l + "%";
    handleR.style.left = r + "%";
    handleL.title = `${reports[leftIdx].name}\n${reports[leftIdx].pulls.length} pulls`;
    handleR.title = `${reports[rightIdx].name}\n${reports[rightIdx].pulls.length} pulls`;
    markers.forEach((m, i) => m.classList.toggle("active", i >= leftIdx && i <= rightIdx));

    // z-index: left handle must be on top when both are at the rightmost position
    // so the user can still drag it left. Right handle on top in all other cases.
    if (leftIdx >= rightIdx && rightIdx === n - 1) {
      handleL.style.zIndex = 4;
      handleR.style.zIndex = 3;
    } else {
      handleL.style.zIndex = 3;
      handleR.style.zIndex = 4;
    }

    setSummary(leftIdx, rightIdx);
  }

  // Render the range summary for an arbitrary [l, r] selection. Called live
  // during dragging so mobile users (where per-marker date labels are hidden)
  // get immediate feedback on which date range they're selecting.
  function setSummary(l, r) {
    const sel   = reports.slice(l, r + 1);
    const pulls = sel.reduce((s, rr) => s + rr.pulls.length, 0);
    const from  = formatDate(sel[0].startedAt);
    const to    = formatDate(sel[sel.length - 1].startedAt);
    const range = from === to ? from : `${from} – ${to}`;
    summary.innerHTML = `<strong>${range}</strong>&ensp;·&ensp;${sel.length}&thinsp;Report${sel.length !== 1 ? "s" : ""}&ensp;·&ensp;${pulls}&thinsp;pulls`;
  }

  function nearestIdx(clientX, which) {
    const rect = track.getBoundingClientRect();
    const p = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    let best = which === "left" ? leftIdx : rightIdx;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (which === "left"  && i > rightIdx) continue;
      if (which === "right" && i < leftIdx)  continue;
      const d = Math.abs(pct(i) - p);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function attachHandle(handle, which) {
    let lastX = 0;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("dragging");
      handle.style.zIndex = 5; // on top during drag regardless of position
      lastX = e.clientX;
    });

    handle.addEventListener("pointermove", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      lastX = e.clientX;
      const previewIdx = nearestIdx(lastX, which);
      const snapPct    = pct(previewIdx);

      handle.style.left = snapPct + "%";
      if (which === "left") {
        fill.style.left  = snapPct + "%";
        fill.style.width = (pct(rightIdx) - snapPct) + "%";
      } else {
        fill.style.width = (snapPct - pct(leftIdx)) + "%";
      }
      const l = which === "left"  ? previewIdx : leftIdx;
      const r = which === "right" ? previewIdx : rightIdx;
      markers.forEach((m, i) => m.classList.toggle("active", i >= l && i <= r));
      setSummary(l, r); // live feedback while dragging (esp. for mobile)
    });

    handle.addEventListener("pointerup", (e) => { lastX = e.clientX; });

    handle.addEventListener("lostpointercapture", () => {
      handle.classList.remove("dragging");
      const idx = nearestIdx(lastX, which);
      if (which === "left") leftIdx = idx;
      else rightIdx = idx;
      updateVisuals();
      onRangeChange(reports.slice(leftIdx, rightIdx + 1));
    });
  }

  attachHandle(handleL, "left");
  attachHandle(handleR, "right");

  updateVisuals();
  onRangeChange(reports.slice(leftIdx, rightIdx + 1));
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}
