// dryft:verifies core.init
import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentInstructions,
  createGithubWorkflow,
  createStarterManifest
} from "../src/init.js";

test("init templates include starter manifest, agent instructions, and GitHub workflow", () => {
  assert.match(createStarterManifest("Example"), /features:/);
  assert.match(createStarterManifest("Example"), /auth.magic-link.login/);
  assert.match(createAgentInstructions(), /dryft:implements <feature-id>/);
  assert.match(createGithubWorkflow(), /uses: dijla-ventures\/dryft-action@v1/);
  assert.match(createGithubWorkflow(), /base: origin\/\$\{\{ github.base_ref \}\}/);
});
