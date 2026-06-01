import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeReasonId, resolvePullReason, createNewBoss, allPulls, UNKNOWN_REASON_ID } from "../shared/schema.js";
import { calculateWipeReasons, calculateTeamPerformance, calculatePlayerReview } from "../shared/calculations.js";
import { parseWarcraftLogsReportUrl, buildFightUrl } from "../shared/report-url.js";
import { analyzePull } from "../shared/analyzers/index.js";

describe("normalizeReasonId", () => {
  it("lowercases and slugifies", () => assert.equal(normalizeReasonId("Missed Interrupt"), "missed-interrupt"));
  it("falls back to unknown for empty string", () => assert.equal(normalizeReasonId(""), UNKNOWN_REASON_ID));
  it("strips quotes", () => assert.equal(normalizeReasonId(`"test"`), "test"));
});

describe("resolvePullReason", () => {
  it("prefers manualWipeReason", () => {
    const pull = {
      manualWipeReason: { reasonId: "manual", playerId: null, source: "manual" },
      autoWipeReason: { reasonId: "auto", playerId: null, source: "auto" }
    };
    assert.equal(resolvePullReason(pull).reasonId, "manual");
  });
  it("falls back to autoWipeReason", () => {
    const pull = { autoWipeReason: { reasonId: "auto", playerId: null, source: "auto" } };
    assert.equal(resolvePullReason(pull).reasonId, "auto");
  });
  it("falls back to unknown", () => assert.equal(resolvePullReason({}).reasonId, UNKNOWN_REASON_ID));
});

describe("createNewBoss", () => {
  it("creates boss with default widgets", () => {
    const boss = createNewBoss("Lura", 0);
    assert.equal(boss.name, "Lura");
    assert.equal(boss.difficulty, "Mythic");
    assert.ok(boss.widgets.length > 0);
    assert.ok(boss.wipeReasons.some((r) => r.id === UNKNOWN_REASON_ID));
  });
});

describe("allPulls", () => {
  it("flattens pulls from all reports", () => {
    const boss = { reports: [{ pulls: [{id:"a"},{id:"b"}] }, { pulls: [{id:"c"}] }] };
    assert.equal(allPulls(boss).length, 3);
  });
  it("returns empty array for boss with no reports", () => {
    assert.deepEqual(allPulls({ reports: [] }), []);
  });
});

describe("calculateWipeReasons", () => {
  const boss = {
    wipeReasons: [
      { id: "unknown", label: "Unknown", color: "#6b7280" },
      { id: "interrupt", label: "Interrupt", color: "#ef4444" }
    ],
    reports: [{
      pulls: [
        { id: "1", manualWipeReason: { reasonId: "interrupt", playerId: "p1", source: "manual" } },
        { id: "2", autoWipeReason: { reasonId: "interrupt", playerId: "p2", source: "auto" } },
        { id: "3" }
      ]
    }]
  };

  it("counts reasons correctly", () => {
    const { total, reasons } = calculateWipeReasons(boss);
    assert.equal(total, 3);
    const interrupt = reasons.find((r) => r.reasonId === "interrupt");
    assert.equal(interrupt.count, 2);
  });

  it("filters by player", () => {
    const { total } = calculateWipeReasons(boss, "p1");
    assert.equal(total, 1);
  });
});

describe("parseWarcraftLogsReportUrl", () => {
  it("extracts code from full URL", () => {
    const { reportCode } = parseWarcraftLogsReportUrl("https://www.warcraftlogs.com/reports/ABC123#fight=1");
    assert.equal(reportCode, "ABC123");
  });
  it("accepts bare code", () => {
    const { reportCode } = parseWarcraftLogsReportUrl("ABC123");
    assert.equal(reportCode, "ABC123");
  });
});

describe("buildFightUrl", () => {
  it("builds correct URL", () => {
    assert.equal(buildFightUrl("ABC123", 5), "https://www.warcraftlogs.com/reports/ABC123#fight=5");
  });
});

describe("analyzePull (Lura)", () => {
  const boss = { name: "Lura", encounterId: 2874 };

  it("detects missed interrupt via Terminate death", () => {
    const pull = { deaths: [{ abilityId: "1286276", playerId: "42" }] };
    const result = analyzePull(pull, boss);
    assert.equal(result.reasonId, "missed-interrupt");
    assert.equal(result.playerId, "42");
  });

  it("falls back to unknown when no relevant death", () => {
    const pull = { deaths: [{ abilityId: "999", playerId: "42" }] };
    const result = analyzePull(pull, boss);
    assert.equal(result.reasonId, UNKNOWN_REASON_ID);
  });
});
