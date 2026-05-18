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
    "1. Before editing, identify the feature(s) your changes belong to. If a Dryft MCP server is available, call `dryft_plan_change` with your intent and the repo-relative files you expect to touch. Otherwise read `dryft.yml` and match the files against each feature's `paths` globs.",
    "2. If your change spans an existing feature, keep working; the manifest already covers you.",
    "3. If your change introduces a new capability that doesn't fit any existing feature, add a new entry under `features:` in `dryft.yml` in the same commit. Use a lowercase hierarchical id (e.g., `auth.magic-link.login`) and a `paths:` glob that covers the new files.",
    "4. If you touch a `deprecated` or `archived` feature, surface this in your PR description.",
    "",
    "## One-shot agent prompt",
    "",
    "Use this prompt when asking an AI coding agent to work in this repo:",
    "",
    "```text",
    "You are working in a repository that uses Dryft as its feature map and MCP controller.",
    "",
    "Before editing:",
    "1. Read dryft.yml or call dryft_list_features if you need the feature map.",
    "2. Call dryft_plan_change with your intent and the repo-relative files you plan to touch.",
    "3. Follow the returned decision, risks, and next steps before editing.",
    "4. Name the feature IDs you are touching in your plan.",
    "",
    "While editing:",
    "- Keep changes inside the matched feature's path boundaries when possible.",
    "- If dryft_plan_change says a new file does not match an existing feature, search with dryft_search_features before creating a new feature.",
    "- If no existing feature fits, update dryft.yml in the same change with a lowercase hierarchical id and paths that cover the new files.",
    "- If you touch a deprecated or archived feature, call that out explicitly.",
    "",
    "Before finishing:",
    "1. Run npx @dijla-ventures-llc/dryft scan --format text.",
    "2. Fix manifest or path problems.",
    "3. Summarize the feature IDs touched and any dryft.yml changes.",
    "```",
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
