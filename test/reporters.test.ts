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
  changedFiles: ["src/auth.ts"],
  references: [],
  features: {
    "auth.magic-link.login": {
      feature: {
        id: "auth.magic-link.login",
        title: "Magic link login",
        status: "active"
      },
      implements: [],
      verifies: [],
      relates: []
    }
  },
  issues: [
    {
      code: "missing-marker",
      severity: "error",
      message: "Changed source file has no Dryft marker.",
      file: "src/auth.ts"
    }
  ]
};

test("toJsonReport emits stable machine-readable JSON", () => {
  const parsed = JSON.parse(toJsonReport(report)) as DryftReport;

  assert.equal(parsed.mode, "ci");
  assert.equal(parsed.issues[0].code, "missing-marker");
});

test("toSarifReport emits GitHub-compatible SARIF results", () => {
  const sarif = JSON.parse(toSarifReport(report));

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.name, "Dryft");
  assert.equal(sarif.runs[0].results[0].ruleId, "missing-marker");
});

test("toTextReport summarizes pass state and issue counts", () => {
  const text = toTextReport(report);

  assert.match(text, /Dryft CI failed/);
  assert.match(text, /1 error/);
  assert.match(text, /src\/auth\.ts/);
});
