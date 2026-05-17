export function createStarterManifest(projectName = "dryft-project"): string {
  return [
    "project:",
    `  name: ${projectName}`,
    "features:",
    "  - id: auth.magic-link.login",
    "    title: Magic link login",
    "    status: active",
    "    owner: platform",
    "    paths:",
    "      - src/auth/**",
    "      - test/auth/**",
    ""
  ].join("\n");
}

export function createAgentInstructions(): string {
  return [
    "# Dryft Feature Index",
    "",
    "This repository uses Dryft to track features. The `dryft.yml` manifest is the source of truth for what features exist and which paths belong to them.",
    "",
    "## When editing code",
    "",
    "1. Before editing, identify the feature(s) your changes belong to. If a Dryft MCP server is available, call `dryft_features_for_file` with the file path. Otherwise read `dryft.yml` and match the file against each feature's `paths` globs.",
    "2. If your change spans an existing feature, keep working; the manifest already covers you.",
    "3. If your change introduces a new capability that doesn't fit any existing feature, add a new entry under `features:` in `dryft.yml` in the same commit. Use a lowercase hierarchical id (e.g., `auth.magic-link.login`) and a `paths:` glob that covers the new files.",
    "4. If you touch a `deprecated` or `archived` feature, surface this in your PR description.",
    "",
    "## One-shot prompt for coding agents",
    "",
    "You are implementing a feature in a repository that uses Dryft. Before editing code, read `dryft.yml` (or call `dryft_list_features` / `dryft_features_for_file` if a Dryft MCP server is registered) to identify which features your changes belong to. If your change adds a new capability that no existing feature covers, add a new feature entry to `dryft.yml` in the same commit using a lowercase hierarchical id and a `paths:` glob covering the new files. When finished, run `npx @dijla-ventures-llc/dryft scan` to confirm the manifest is valid.",
    ""
  ].join("\n");
}

export function createMcpConfig(): string {
  return [
    "{",
    '  "mcpServers": {',
    '    "dryft": {',
    '      "command": "npx",',
    '      "args": ["-y", "@dijla-ventures-llc/dryft@latest", "mcp"]',
    "    }",
    "  }",
    "}",
    ""
  ].join("\n");
}
