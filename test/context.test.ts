// dryft:verifies core.context
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
import type { DryftManifest, DryftMarker } from "../src/types.js";

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

const markers: DryftMarker[] = [
  {
    role: "implements",
    featureId: "auth.login",
    file: "src/auth/login.ts",
    line: 1,
    column: 4,
    raw: "dryft:implements auth.login"
  },
  {
    role: "verifies",
    featureId: "auth.login",
    file: "test/auth/login.test.ts",
    line: 1,
    column: 4,
    raw: "dryft:verifies auth.login"
  },
  {
    role: "implements",
    featureId: "ops.legacy",
    file: "src/ops/runbook.ts",
    line: 1,
    column: 4,
    raw: "dryft:implements ops.legacy"
  }
];

test("computeFeatureIndex unions marker and path memberships", () => {
  const index = computeFeatureIndex(manifest, files, markers);

  assert.equal(index.features["auth.login"].markerFiles.length, 2);
  assert.equal(index.features["auth.login"].pathFiles.length, 3);
  assert.deepEqual(index.features["auth.login"].allFiles, [
    "src/auth/login.ts",
    "src/auth/session.ts",
    "test/auth/login.test.ts"
  ]);
  assert.equal(index.features["billing.checkout"].markerFiles.length, 0);
  assert.equal(index.features["billing.checkout"].pathFiles.length, 1);
  assert.equal(index.features["ops.legacy"].pathFiles.length, 0);
  assert.equal(index.features["ops.legacy"].markerFiles.length, 1);
});

test("computeFeatureIndex ignores markers for unknown features", () => {
  const index = computeFeatureIndex(manifest, files, [
    ...markers,
    {
      role: "implements",
      featureId: "ghost.feature",
      file: "src/ops/runbook.ts",
      line: 5,
      column: 4,
      raw: "dryft:implements ghost.feature"
    }
  ]);

  assert.equal(Object.keys(index.features).length, 3);
  assert.equal(index.features["ops.legacy"].markers.length, 1);
});

test("listFeatures returns sorted summaries with counts", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  const summaries = listFeatures(index);

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    ["auth.login", "billing.checkout", "ops.legacy"]
  );
  assert.equal(summaries[0].fileCount, 3);
  assert.equal(summaries[0].markerCount, 2);
  assert.equal(summaries[1].fileCount, 1);
  assert.equal(summaries[2].markerCount, 1);
});

test("getFeature returns marker- and path-sourced files with roles", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  const detail = getFeature(index, "auth.login");

  assert.ok(detail);
  assert.equal(detail.feature.id, "auth.login");
  assert.deepEqual(detail.files, [
    { file: "src/auth/login.ts", source: "marker" },
    { file: "src/auth/session.ts", source: "path" },
    { file: "test/auth/login.test.ts", source: "marker" }
  ]);
  assert.equal(detail.markers.implements.length, 1);
  assert.equal(detail.markers.verifies.length, 1);
  assert.equal(detail.markers.relates.length, 0);
});

test("getFeature returns undefined for unknown id", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  assert.equal(getFeature(index, "no.such.feature"), undefined);
});

test("featuresForFile prefers marker source over path source", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  const memberships = featuresForFile(index, "src/auth/login.ts");

  assert.equal(memberships.length, 1);
  assert.deepEqual(memberships[0], {
    featureId: "auth.login",
    source: "marker"
  });
});

test("featuresForFile returns path-only memberships for unmarked files", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  const memberships = featuresForFile(index, "src/auth/session.ts");

  assert.deepEqual(memberships, [
    { featureId: "auth.login", source: "path" }
  ]);
});

test("featuresForFile returns empty list when file is unowned", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  assert.deepEqual(featuresForFile(index, "src/ops/runbook.ts"), [
    { featureId: "ops.legacy", source: "marker" }
  ]);
  assert.deepEqual(featuresForFile(index, "README.md"), []);
});

test("filesForFeature returns marker + path files merged", () => {
  const index = computeFeatureIndex(manifest, files, markers);
  const files_ = filesForFeature(index, "auth.login");

  assert.equal(files_.length, 3);
  assert.equal(files_.filter((entry) => entry.source === "marker").length, 2);
  assert.equal(files_.filter((entry) => entry.source === "path").length, 1);
});

test("searchFeatures matches id, title, and owner substrings", () => {
  const index = computeFeatureIndex(manifest, files, markers);

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
