import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFeatureIndex,
  featuresForFile,
  filesForFeature,
  getFeature,
  listFeatures,
  planChange,
  searchFeatures
} from "../src/context.js";
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
      paths: ["src/auth/**", "test/auth/**"]
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
      paths: ["src/ops/**"]
    },
    {
      id: "admin.retired",
      title: "Retired admin",
      status: "archived",
      paths: ["src/admin/retired/**"]
    }
  ]
};

const files = [
  "src/auth/login.ts",
  "src/auth/session.ts",
  "src/billing/checkout.ts",
  "src/ops/runbook.ts",
  "test/auth/login.test.ts"
];

test("computeFeatureIndex groups files by path glob membership", () => {
  const index = computeFeatureIndex(manifest, files);

  assert.deepEqual(index.features["auth.login"].files, [
    "src/auth/login.ts",
    "src/auth/session.ts",
    "test/auth/login.test.ts"
  ]);
  assert.deepEqual(index.features["billing.checkout"].files, [
    "src/billing/checkout.ts"
  ]);
  assert.deepEqual(index.features["ops.legacy"].files, ["src/ops/runbook.ts"]);
});

test("computeFeatureIndex deduplicates files matching multiple globs", () => {
  const overlap: DryftManifest = {
    ...manifest,
    features: [
      {
        id: "feat.a",
        title: "A",
        status: "active",
        paths: ["src/**", "src/auth/**"]
      }
    ]
  };
  const index = computeFeatureIndex(overlap, ["src/auth/login.ts"]);

  assert.deepEqual(index.features["feat.a"].files, ["src/auth/login.ts"]);
});

test("listFeatures returns sorted summaries with counts", () => {
  const index = computeFeatureIndex(manifest, files);
  const summaries = listFeatures(index);

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    ["admin.retired", "auth.login", "billing.checkout", "ops.legacy"]
  );
  assert.equal(summaries[0].fileCount, 0);
  assert.equal(summaries[1].fileCount, 3);
  assert.equal(summaries[2].fileCount, 1);
  assert.equal(summaries[3].fileCount, 1);
});

test("getFeature returns files for a known id", () => {
  const index = computeFeatureIndex(manifest, files);
  const detail = getFeature(index, "auth.login");

  assert.ok(detail);
  assert.equal(detail.feature.id, "auth.login");
  assert.deepEqual(detail.files, [
    "src/auth/login.ts",
    "src/auth/session.ts",
    "test/auth/login.test.ts"
  ]);
});

test("getFeature returns undefined for unknown id", () => {
  const index = computeFeatureIndex(manifest, files);
  assert.equal(getFeature(index, "no.such.feature"), undefined);
});

test("featuresForFile returns feature ids a file belongs to", () => {
  const index = computeFeatureIndex(manifest, files);
  assert.deepEqual(featuresForFile(index, "src/auth/login.ts"), ["auth.login"]);
  assert.deepEqual(featuresForFile(index, "src/billing/checkout.ts"), [
    "billing.checkout"
  ]);
});

test("featuresForFile resolves paths even when the file was not indexed", () => {
  const index = computeFeatureIndex(manifest, files);

  assert.deepEqual(featuresForFile(index, "src/auth/new-flow.ts"), [
    "auth.login"
  ]);
  assert.deepEqual(featuresForFile(index, "src\\auth\\windows-path.ts"), [
    "auth.login"
  ]);
});

test("featuresForFile returns empty list when file is unowned", () => {
  const index = computeFeatureIndex(manifest, files);
  assert.deepEqual(featuresForFile(index, "README.md"), []);
});

test("filesForFeature returns the same list as the index entry", () => {
  const index = computeFeatureIndex(manifest, files);
  assert.deepEqual(filesForFeature(index, "auth.login"), [
    "src/auth/login.ts",
    "src/auth/session.ts",
    "test/auth/login.test.ts"
  ]);
  assert.deepEqual(filesForFeature(index, "ops.legacy"), ["src/ops/runbook.ts"]);
});

test("searchFeatures matches id, title, and owner substrings", () => {
  const index = computeFeatureIndex(manifest, files);

  assert.deepEqual(
    searchFeatures(index, "login").map((summary) => summary.id),
    ["auth.login"]
  );
  assert.deepEqual(
    searchFeatures(index, "checkout").map((summary) => summary.id),
    ["billing.checkout"]
  );
  assert.deepEqual(
    searchFeatures(index, "platform").map((summary) => summary.id),
    ["auth.login"]
  );
  assert.deepEqual(searchFeatures(index, ""), []);
  assert.deepEqual(searchFeatures(index, "nothing"), []);
});

test("planChange returns ready for active owned files", () => {
  const index = computeFeatureIndex(manifest, files);

  const plan = planChange(index, {
    intent: "Update login session handling",
    files: ["src/auth/login.ts", "src\\auth\\new-flow.ts"]
  });

  assert.equal(plan.decision, "ready");
  assert.deepEqual(
    plan.files.map((file) => file.path),
    ["src/auth/login.ts", "src/auth/new-flow.ts"]
  );
  assert.deepEqual(
    plan.features.map((feature) => feature.id),
    ["auth.login"]
  );
  assert.deepEqual(plan.risks, []);
  assert.ok(plan.nextSteps.some((step) => step.includes("auth.login")));
});

test("planChange asks for manifest updates for unowned files", () => {
  const index = computeFeatureIndex(manifest, files);

  const plan = planChange(index, {
    intent: "Add public docs",
    files: ["docs/getting-started.md"]
  });

  assert.equal(plan.decision, "needs_manifest_update");
  assert.equal(plan.files[0].ownership, "unowned");
  assert.equal(plan.files[0].suggestedPathGlob, "docs/**");
  assert.equal(plan.risks[0].code, "unowned_file");
});

test("planChange escalates deprecated, archived, and cross-feature changes", () => {
  const index = computeFeatureIndex(manifest, files);

  const deprecatedPlan = planChange(index, {
    intent: "Update legacy runbook",
    files: ["src/ops/runbook.ts"]
  });
  assert.equal(deprecatedPlan.decision, "needs_review");
  assert.equal(deprecatedPlan.risks[0].code, "deprecated_feature");

  const archivedPlan = planChange(index, {
    intent: "Patch retired admin flow",
    files: ["src/admin/retired/user.ts"]
  });
  assert.equal(archivedPlan.decision, "blocked_archived");
  assert.equal(archivedPlan.risks[0].code, "archived_feature");

  const crossFeaturePlan = planChange(index, {
    intent: "Coordinate auth and billing",
    files: ["src/auth/login.ts", "src/billing/checkout.ts"]
  });
  assert.equal(crossFeaturePlan.decision, "needs_review");
  assert.ok(
    crossFeaturePlan.risks.some((risk) => risk.code === "cross_feature_change")
  );
});
