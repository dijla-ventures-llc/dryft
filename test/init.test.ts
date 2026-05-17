import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentInstructions,
  createMcpConfig,
  createStarterManifest
} from "../src/init.js";

test("init templates include starter manifest, agent instructions, and MCP config", () => {
  assert.match(createStarterManifest("Example"), /features:/);
  assert.match(createStarterManifest("Example"), /auth.magic-link.login/);
  assert.match(createAgentInstructions(), /dryft_features_for_file/);
  assert.match(createMcpConfig(), /"mcpServers"/);
  assert.match(createMcpConfig(), /@dijla-ventures-llc\/dryft@latest/);
  assert.match(createMcpConfig(), /"mcp"/);
});
