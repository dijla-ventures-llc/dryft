import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFeatureIndex,
  featuresForFile,
  filesForFeature,
  getFeature,
  listFeatures,
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
      status: "deprecated"
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
  assert.deepEqual(index.features["ops.legacy"].files, []);
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
    ["auth.login", "billing.checkout", "ops.legacy"]
  );
  assert.equal(summaries[0].fileCount, 3);
  assert.equal(summaries[1].fileCount, 1);
  assert.equal(summaries[2].fileCount, 0);
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

test("featuresForFile returns empty list when file is unowned", () => {
  const index = computeFeatureIndex(manifest, files);
  assert.deepEqual(featuresForFile(index, "src/ops/runbook.ts"), []);
  assert.deepEqual(featuresForFile(index, "README.md"), []);
});

test("filesForFeature returns the same list as the index entry", () => {
  const index = computeFeatureIndex(manifest, files);
  assert.deepEqual(filesForFeature(index, "auth.login"), [
    "src/auth/login.ts",
    "src/auth/session.ts",
    "test/auth/login.test.ts"
  ]);
  assert.deepEqual(filesForFeature(index, "ops.legacy"), []);
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
