// dryft:verifies core.infer
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildInferPrompt,
  extractYaml,
  runInfer,
  type AnthropicLike
} from "../src/infer.js";

function makeClient(text: string): { client: AnthropicLike; calls: number } {
  let calls = 0;
  const client: AnthropicLike = {
    messages: {
      create: async () => {
        calls += 1;
        return { content: [{ type: "text", text }] };
      }
    }
  };
  return {
    client,
    get calls() {
      return calls;
    }
  } as { client: AnthropicLike; calls: number };
}

const validYaml = [
  "project:",
  "  name: TempProject",
  "features:",
  "  - id: auth.login",
  "    title: Login",
  "    status: active",
  "    paths:",
  "      - src/auth/**",
  ""
].join("\n");

async function setupRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dryft-infer-"));
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(join(dir, "src", "auth", "login.ts"), "export const x = 1;\n");
  return dir;
}

test("buildInferPrompt mentions schema, files, and project name", async () => {
  const dir = await setupRepo();
  const prompt = buildInferPrompt(dir, ["src/auth/login.ts", "src/auth/session.ts"]);
  assert.match(prompt, /dryft\.yml/);
  assert.match(prompt, /src\/auth\/login\.ts/);
  assert.match(prompt, /status: active/);
});

test("extractYaml strips ```yaml code fences", () => {
  const fenced = extractYaml({
    content: [
      {
        type: "text",
        text: "```yaml\nproject:\n  name: X\nfeatures: []\n```"
      }
    ]
  });
  assert.equal(fenced, "project:\n  name: X\nfeatures: []");
});

test("extractYaml strips plain ``` fences", () => {
  const fenced = extractYaml({
    content: [
      {
        type: "text",
        text: "```\nproject:\n  name: X\nfeatures: []\n```"
      }
    ]
  });
  assert.equal(fenced, "project:\n  name: X\nfeatures: []");
});

test("extractYaml passes through unfenced text", () => {
  const plain = extractYaml({
    content: [{ type: "text", text: "project:\n  name: Y\nfeatures: []" }]
  });
  assert.equal(plain, "project:\n  name: Y\nfeatures: []");
});

test("runInfer writes dryft.yml when valid YAML comes back", async () => {
  const dir = await setupRepo();
  const { client } = makeClient(validYaml);

  const result = await runInfer({ cwd: dir, client });

  assert.equal(result.wrote, true);
  assert.equal(result.path, join(dir, "dryft.yml"));
  const written = await readFile(join(dir, "dryft.yml"), "utf8");
  assert.match(written, /auth\.login/);
});

test("runInfer dry-run does not write the manifest", async () => {
  const dir = await setupRepo();
  const { client } = makeClient(validYaml);

  const result = await runInfer({ cwd: dir, client, dryRun: true });

  assert.equal(result.wrote, false);
  assert.equal(result.path, undefined);
  await assert.rejects(() => readFile(join(dir, "dryft.yml"), "utf8"));
});

test("runInfer rejects invalid YAML from the model", async () => {
  const dir = await setupRepo();
  const { client } = makeClient(
    "project:\n  name: Broken\nfeatures:\n  - id: BadID\n    title: x\n    status: active\n"
  );

  await assert.rejects(
    () => runInfer({ cwd: dir, client }),
    /Feature id "BadID" must use lowercase hierarchical segments/
  );
});

test("runInfer rejects empty responses", async () => {
  const dir = await setupRepo();
  const { client } = makeClient("");

  await assert.rejects(
    () => runInfer({ cwd: dir, client }),
    /no usable YAML/
  );
});
