import assert from "node:assert/strict";
import test from "node:test";

import { computeFeatureIndex } from "../src/context.js";
import { verifyChange } from "../src/verify.js";
import type { DryftManifest } from "../src/types.js";

const manifest: DryftManifest = {
  project: { name: "Example" },
  path: "/tmp/example/dryft.yml",
  features: [
    {
      id: "auth.login",
      title: "Login flow",
      status: "active",
      owner: "platform",
      paths: ["src/auth/**"]
    },
    {
      id: "billing.checkout",
      title: "Checkout flow",
      status: "active",
      owner: "growth",
      paths: ["src/billing/**"]
    },
    {
      id: "ops.legacy",
      title: "Legacy ops tooling",
      status: "deprecated",
      owner: "ops",
      paths: ["src/ops/**"]
    },
    {
      id: "admin.retired",
      title: "Retired admin",
      status: "archived",
      owner: "ops",
      paths: ["src/admin/retired/**"]
    }
  ]
};

const index = computeFeatureIndex(manifest, [
  "src/auth/login.ts",
  "src/billing/checkout.ts",
  "src/ops/runbook.ts",
  "src/admin/retired/user.ts"
]);

test("verifyChange verifies actual files that match the planned feature boundary", () => {
  const result = verifyChange(index, {
    intent: "Update login flow",
    plannedFiles: ["src/auth/login.ts"],
    changedFiles: ["src/auth/login.ts"]
  });

  assert.equal(result.decision, "verified");
  assert.deepEqual(result.plannedFeatures.map((feature) => feature.id), [
    "auth.login"
  ]);
  assert.deepEqual(result.actualFeatures.map((feature) => feature.id), [
    "auth.login"
  ]);
  assert.deepEqual(result.risks, []);
  assert.match(result.receipt, /Dryft Receipt: verified/);
  assert.match(result.receipt, /Planned features: auth\.login/);
  assert.match(result.receipt, /Actual features: auth\.login/);
});

test("verifyChange reports unplanned files and unexpected features", () => {
  const result = verifyChange(index, {
    intent: "Update login flow",
    plannedFiles: ["src/auth/login.ts"],
    changedFiles: ["src/auth/login.ts", "src/billing/checkout.ts"]
  });

  assert.equal(result.decision, "needs_review");
  assert.deepEqual(result.unplannedFiles, ["src/billing/checkout.ts"]);
  assert.deepEqual(result.unexpectedFeatures.map((feature) => feature.id), [
    "billing.checkout"
  ]);
  assert.ok(result.risks.some((risk) => risk.code === "unplanned_file"));
  assert.ok(result.risks.some((risk) => risk.code === "unexpected_feature"));
  assert.match(result.receipt, /Dryft Receipt: needs_review/);
  assert.match(result.receipt, /Unplanned files: src\/billing\/checkout\.ts/);
  assert.match(result.receipt, /Required:/);
});

test("verifyChange describes planned cross-feature changes without saying the files differed from the plan", () => {
  const result = verifyChange(index, {
    intent: "Coordinate login and checkout",
    plannedFiles: ["src/auth/login.ts", "src/billing/checkout.ts"],
    changedFiles: ["src/auth/login.ts", "src/billing/checkout.ts"]
  });

  assert.equal(result.decision, "needs_review");
  assert.ok(result.risks.some((risk) => risk.code === "cross_feature_change"));
  assert.ok(
    result.nextSteps.some((step) =>
      step.includes("Summarize the cross-feature impact")
    )
  );
  assert.ok(
    result.nextSteps.every(
      (step) => !step.includes("differ from the plan")
    )
  );
});

test("verifyChange asks for manifest updates when actual files are unowned", () => {
  const result = verifyChange(index, {
    intent: "Add docs",
    plannedFiles: ["docs/getting-started.md"],
    changedFiles: ["docs/getting-started.md"]
  });

  assert.equal(result.decision, "needs_manifest_update");
  assert.deepEqual(result.unownedFiles, ["docs/getting-started.md"]);
  assert.ok(result.risks.some((risk) => risk.code === "unowned_file"));
  assert.equal(result.manifestSuggestions[0]?.featureId, "docs");
  assert.match(result.manifestSuggestions[0]?.yaml ?? "", /id: docs/);
  assert.match(result.manifestSuggestions[0]?.yaml ?? "", /docs\/\*\*/);
});

test("verifyChange escalates deprecated and archived actual changes", () => {
  const deprecated = verifyChange(index, {
    intent: "Update legacy ops",
    plannedFiles: ["src/ops/runbook.ts"],
    changedFiles: ["src/ops/runbook.ts"]
  });
  assert.equal(deprecated.decision, "needs_review");
  assert.ok(deprecated.risks.some((risk) => risk.code === "deprecated_feature"));

  const archived = verifyChange(index, {
    intent: "Patch retired admin",
    plannedFiles: ["src/admin/retired/user.ts"],
    changedFiles: ["src/admin/retired/user.ts"]
  });
  assert.equal(archived.decision, "blocked_archived");
  assert.ok(archived.risks.some((risk) => risk.code === "archived_feature"));
});

test("verifyChange treats missing planned files as an intent-only verification", () => {
  const result = verifyChange(index, {
    intent: "Update login flow",
    changedFiles: ["src/auth/login.ts"]
  });

  assert.equal(result.decision, "verified");
  assert.deepEqual(result.plannedFiles, []);
  assert.deepEqual(result.unplannedFiles, []);
});

test("verifyChange normalizes Windows paths before comparing plan and git changes", () => {
  const result = verifyChange(index, {
    intent: "Update login flow",
    plannedFiles: ["src\\auth\\login.ts"],
    changedFiles: ["src\\auth\\login.ts"]
  });

  assert.equal(result.decision, "verified");
  assert.deepEqual(result.plannedFiles, ["src/auth/login.ts"]);
  assert.deepEqual(result.actualFiles, ["src/auth/login.ts"]);
});

test("verifyChange matches new files against manifest path globs even before they exist in the index", () => {
  const result = verifyChange(index, {
    intent: "Add login recovery",
    plannedFiles: ["src/auth/recovery.ts"],
    changedFiles: ["src/auth/recovery.ts"]
  });

  assert.equal(result.decision, "verified");
  assert.deepEqual(result.actualFeatures.map((feature) => feature.id), [
    "auth.login"
  ]);
});
