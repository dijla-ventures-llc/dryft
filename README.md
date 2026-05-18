# Dryft

**A feature map and MCP pre-edit controller for AI coding agents.**

[![npm](https://img.shields.io/npm/v/%40dijla-ventures-llc%2Fdryft)](https://www.npmjs.com/package/@dijla-ventures-llc/dryft)

Dryft gives coding agents a structured map of the features in a repository before they edit files. A checked-in `dryft.yml` defines the product and platform areas in your codebase. The Dryft MCP server lets agents plan changes against that feature map instead of guessing which product area they are touching.

The product flow is:

1. A human or agent creates and reviews `dryft.yml`.
2. The repo exposes Dryft as an MCP server through Codex, Claude Code, or another MCP client.
3. Coding agents call `dryft_plan_change` before editing.
4. Optional drift checks warn when changes touch deprecated or archived feature areas.

## Use Dryft With AI Coding Agents

Dryft works well only after setup. A repo needs a reviewed `dryft.yml` that reflects real feature boundaries, and your agent needs access to the Dryft MCP server.

### Setup First

Install Dryft in the repository that should expose feature context:

```sh
npm install -D @dijla-ventures-llc/dryft
```

Initialize the repo:

```sh
npx dryft init
```

Review and edit `dryft.yml` before relying on it. This file is the feature map that every agent query depends on.

`dryft init` writes three files:

| File | Purpose |
| --- | --- |
| `dryft.yml` | The feature map. This is the source of truth. |
| `AGENTS.md` | Instructions telling coding agents to query Dryft before editing. |
| `.mcp.json` | Local MCP server config for agents that read repo MCP settings. |

### Connect Codex

Dryft is also a Codex plugin source. Add the marketplace:

```sh
codex plugin marketplace add dijla-ventures-llc/dryft --ref main
```

Restart Codex, open the plugin directory, choose the `Dryft` marketplace, and install the `Dryft` plugin. The plugin bundles:

- MCP config that starts `npx -y @dijla-ventures-llc/dryft@latest mcp`
- A Codex skill that tells the agent to call `dryft_plan_change` before editing files

If you added the marketplace before a Dryft plugin update, refresh it:

```sh
codex plugin marketplace upgrade dryft-plugins
```

If it still does not appear, remove and re-add it, then restart Codex:

```sh
codex plugin marketplace remove dryft-plugins
codex plugin marketplace add dijla-ventures-llc/dryft --ref main
```

### Connect Claude Code

Claude Code can use project-scoped MCP servers from `.mcp.json` and prompts for approval before using them. Dryft's generated `.mcp.json` uses that project setup:

```json
{
  "mcpServers": {
    "dryft": {
      "command": "npx",
      "args": ["-y", "@dijla-ventures-llc/dryft@latest", "mcp"]
    }
  }
}
```

See the [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) for Claude's MCP setup behavior.

### Agent Pre-Edit Flow

Before editing, the agent should ask Dryft to plan the change:

```text
dryft_plan_change(
  intent="Add password reset email flow",
  files=["src/auth/reset.ts", "test/auth/reset.test.ts"]
)
```

Dryft returns:

- `ready` when the planned files belong to active feature areas
- `needs_review` when the change touches deprecated or multiple feature areas
- `needs_manifest_update` when a file is not covered by `dryft.yml`
- `blocked_archived` when a file touches an archived feature

One-shot prompt for coding agents:

```text
You are working in a repository that uses Dryft as its feature map and MCP controller.

Before editing:
1. Read dryft.yml or call dryft_list_features if you need the feature map.
2. Call dryft_plan_change with your intent and the repo-relative files you plan to touch.
3. Follow the returned decision, risks, and next steps before editing.
4. Name the feature IDs you are touching in your plan.

While editing:
- Keep changes inside the matched feature's path boundaries when possible.
- If dryft_plan_change says a new file does not match an existing feature, search with dryft_search_features before creating a new feature.
- If no existing feature fits, update dryft.yml in the same change with a lowercase hierarchical id and paths that cover the new files.
- If you touch a deprecated or archived feature, call that out explicitly.

Before finishing:
1. Run npx @dijla-ventures-llc/dryft scan --format text.
2. Fix manifest or path problems.
3. Summarize the feature IDs touched and any dryft.yml changes.
```

The useful MCP tools are:

| Tool | Use |
| --- | --- |
| `dryft_plan_change` | Plan a change before editing with intent, files, feature ownership, risks, and next steps. |
| `dryft_list_features` | List every feature with id, status, title, owner, and file count. |
| `dryft_get_feature` | Get one feature's metadata and matching files. |
| `dryft_features_for_file` | Find which feature or features own a file path. |
| `dryft_files_for_feature` | List all files matched by a feature's path globs. |
| `dryft_search_features` | Search feature id, title, and owner. |

If you are bootstrapping a repo and want a first-pass manifest from the file tree:

```sh
ANTHROPIC_API_KEY=... npx dryft init --infer --dry-run
```

Review inferred manifests before committing them.

## The Manifest

`dryft.yml`, `dryft.yaml`, or `dryft.json` defines features and the path globs that belong to each feature:

```yaml
project:
  name: my-app
features:
  - id: auth.magic-link.login
    title: Magic link login
    status: active
    owner: platform
    paths:
      - src/auth/**
      - test/auth/**

  - id: billing.checkout
    title: Checkout flow
    status: active
    owner: growth
    paths:
      - src/billing/**
      - test/billing/**
```

Feature IDs use lowercase hierarchical segments, such as `auth.magic-link.login`, `billing.checkout`, or `core.observability`.

Statuses:

- `active`: current feature area
- `deprecated`: still present, but changes should be reviewed carefully
- `archived`: should not receive new changes

Features without `paths` are visible in listings but cannot be resolved from file paths.

## Human CLI Usage

List all features:

```sh
npx dryft context list
```

Find the feature for a file:

```sh
npx dryft context file src/auth/login.ts
```

Inspect a feature:

```sh
npx dryft context feature auth.magic-link.login
```

Search for a feature:

```sh
npx dryft context search login
```

Start the MCP server manually:

```sh
npx dryft mcp
```

JSON output is available for automation:

```sh
npx dryft context list --format json
npx dryft context file src/auth/login.ts --format json
```

## Drift Checks

Dryft v0.3 is MCP-first, but the CLI still includes a narrow PR drift check:

```sh
npx dryft ci --base origin/main
```

It reports:

- `deprecated-feature-touched`: warning when a changed file matches a deprecated feature
- `archived-feature-touched`: error when a changed file matches an archived feature

Use `scan` to validate the manifest and summarize feature file counts:

```sh
npx dryft scan --format text
npx dryft scan --format json
```

## What Dryft Is Not

- It is not a documentation generator.
- It is not a dashboard yet.
- It is not an AST analyzer.
- It does not require inline code annotations.

Dryft is the checked-in feature map plus the agent-facing MCP tools that make that map usable during coding.

## License

Apache-2.0. Copyright 2026 Dijla Ventures LLC.
