// dryft:verifies core.mcp
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

async function setupRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dryft-mcp-"));
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
      "      - test/auth/**",
      "  - id: billing.checkout",
      "    title: Checkout flow",
      "    status: active",
      "    owner: growth",
      "    paths:",
      "      - src/billing/**",
      ""
    ].join("\n")
  );
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await mkdir(join(dir, "src", "billing"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );
  await writeFile(
    join(dir, "src", "auth", "session.ts"),
    "export const session = true;\n"
  );
  await writeFile(
    join(dir, "src", "billing", "checkout.ts"),
    "export const checkout = true;\n"
  );
  return dir;
}

async function withMcpClient(
  dir: string,
  fn: (client: Client) => Promise<void>
): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, "mcp", "--cwd", dir]
  });
  const client = new Client(
    { name: "dryft-test", version: "0.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

test("MCP server lists five context tools", async () => {
  const dir = await setupRepo();
  await withMcpClient(dir, async (client) => {
    const response = await client.listTools();
    const names = response.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "dryft_features_for_file",
      "dryft_files_for_feature",
      "dryft_get_feature",
      "dryft_list_features",
      "dryft_search_features"
    ]);
  });
});

test("dryft_list_features returns Markdown with feature ids", async () => {
  const dir = await setupRepo();
  await withMcpClient(dir, async (client) => {
    const result = await client.callTool({
      name: "dryft_list_features",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text: string }>;
    assert.equal(content[0].type, "text");
    assert.match(content[0].text, /auth\.magic-link\.login/);
    assert.match(content[0].text, /billing\.checkout/);
  });
});

test("dryft_get_feature returns files that match its path globs", async () => {
  const dir = await setupRepo();
  await withMcpClient(dir, async (client) => {
    const result = await client.callTool({
      name: "dryft_get_feature",
      arguments: { id: "auth.magic-link.login" }
    });
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0].text, /src\/auth\/login\.ts/);
    assert.match(content[0].text, /src\/auth\/session\.ts/);
  });
});

test("dryft_features_for_file returns the feature membership for a path", async () => {
  const dir = await setupRepo();
  await withMcpClient(dir, async (client) => {
    const result = await client.callTool({
      name: "dryft_features_for_file",
      arguments: { path: "src/auth/login.ts" }
    });
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0].text, /auth\.magic-link\.login/);
  });
});

test("dryft_search_features matches owner substring", async () => {
  const dir = await setupRepo();
  await withMcpClient(dir, async (client) => {
    const result = await client.callTool({
      name: "dryft_search_features",
      arguments: { query: "growth" }
    });
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0].text, /billing\.checkout/);
    assert.doesNotMatch(content[0].text, /auth\.magic-link\.login/);
  });
});

test("dryft_get_feature returns an error for unknown ids", async () => {
  const dir = await setupRepo();
  await withMcpClient(dir, async (client) => {
    const result = await client.callTool({
      name: "dryft_get_feature",
      arguments: { id: "nope.not.here" }
    });
    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0].text, /Unknown feature/);
  });
});
