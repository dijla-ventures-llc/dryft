// dryft:verifies core.reporting
import assert from "node:assert/strict";
import test from "node:test";

import { toJsonReport, toSarifReport, toTextReport } from "../src/reporters.js";
import type { DryftReport } from "../src/types.js";

const report: DryftReport = {
  project: { name: "Example" },
  mode: "ci",
  passed: false,
  baseRef: "origin/main",
  scannedFiles: 1,
  changedFiles: ["src/auth/legacy.ts"],
  features: {
    "auth.legacy": {
      id: "auth.legacy",
      title: "Legacy auth",
      status: "archived",
      fileCount: 1
    }
  },
  issues: [
    {
      code: "archived-feature-touched",
      severity: "error",
      message: 'Changed file touches archived feature "auth.legacy".',
      file: "src/auth/legacy.ts",
      featureId: "auth.legacy"
    }
  ]
};

test("toJsonReport emits stable machine-readable JSON", () => {
  const parsed = JSON.parse(toJsonReport(report)) as DryftReport;

  assert.equal(parsed.mode, "ci");
  assert.equal(parsed.issues[0].code, "archived-feature-touched");
});

test("toSarifReport emits GitHub-compatible SARIF results", () => {
  const sarif = JSON.parse(toSarifReport(report));

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.name, "Dryft");
  assert.equal(sarif.runs[0].results[0].ruleId, "archived-feature-touched");
});

test("toTextReport summarizes pass state and issue counts", () => {
  const text = toTextReport(report);

  assert.match(text, /Dryft CI failed/);
  assert.match(text, /1 error/);
  assert.match(text, /src\/auth\/legacy\.ts/);
});
