// dryft:verifies core.manifest
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadManifest } from "../src/manifest.js";

test("loads a YAML manifest with hierarchical feature ids and optional path globs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-manifest-"));
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: auth.magic-link.login",
      "    title: Magic link login",
      "    status: active",
      "    owner: platform",
      "    paths:",
      "      - src/auth/**",
      "      - test/auth/**"
    ].join("\n")
  );

  const manifest = await loadManifest(dir);

  assert.equal(manifest.project.name, "Example");
  assert.deepEqual(manifest.features[0], {
    id: "auth.magic-link.login",
    title: "Magic link login",
    status: "active",
    owner: "platform",
    paths: ["src/auth/**", "test/auth/**"]
  });
});

test("loads JSON manifests and rejects invalid feature ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-manifest-"));
  await writeFile(
    join(dir, "dryft.json"),
    JSON.stringify({
      project: { name: "Example" },
      features: [{ id: "Auth Magic Link", title: "Bad id", status: "active" }]
    })
  );

  await assert.rejects(
    () => loadManifest(dir),
    /Feature id "Auth Magic Link" must use lowercase hierarchical segments/
  );
});
