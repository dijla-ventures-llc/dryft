import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadManifest } from "../src/manifest.js";
import { scanRepository } from "../src/scanner.js";

test("scanRepository groups files by feature path globs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-scan-"));
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await mkdir(join(dir, "test", "auth"), { recursive: true });
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: auth.login",
      "    title: Login",
      "    status: active",
      "    paths:",
      "      - src/auth/**",
      "      - test/auth/**"
    ].join("\n")
  );
  await writeFile(join(dir, "src", "auth", "login.ts"), "export const login = true;\n");
  await writeFile(
    join(dir, "test", "auth", "login.test.ts"),
    "export const testLogin = true;\n"
  );

  const manifest = await loadManifest(dir);
  const report = await scanRepository({ cwd: dir, manifest });

  assert.equal(report.passed, true);
  assert.equal(report.features["auth.login"].fileCount, 2);
  assert.deepEqual(report.issues, []);
});

test("scanRepository reports zero fileCount for features without matching paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-scan-"));
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: orphan.feature",
      "    title: Orphan",
      "    status: active",
      "    paths:",
      "      - never/matches/**"
    ].join("\n")
  );

  const manifest = await loadManifest(dir);
  const report = await scanRepository({ cwd: dir, manifest });

  assert.equal(report.features["orphan.feature"].fileCount, 0);
});
