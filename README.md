# Dryft

**A feature map and MCP controller for AI coding agents.**

[![npm](https://img.shields.io/npm/v/%40dijla-ventures-llc%2Fdryft)](https://www.npmjs.com/package/@dijla-ventures-llc/dryft)

Dryft gives coding agents a structured map of the features in a repository before they edit files. A checked-in `dryft.yml` defines the product and platform areas in your codebase. The Dryft CLI and MCP server let agents ask which feature owns a file, which files belong to a feature, and what feature IDs already exist.

The product flow is:

1. A human or agent creates `dryft.yml`.
2. The repo exposes Dryft as an MCP server.
3. Coding agents query Dryft before editing.
4. Optional drift checks warn when changes touch deprecated or archived feature areas.

## Install

Install Dryft in the repository that should expose feature context:

```sh
npm install -D @dijla-ventures-llc/dryft
```

Initialize the repo:

```sh
npx dryft init
```

This writes three files:

| File | Purpose |
| --- | --- |
| `dryft.yml` | The feature map. This is the source of truth. |
| `AGENTS.md` | Instructions telling coding agents to query Dryft before editing. |
| `.mcp.json` | Local MCP server config for agents that read repo MCP settings. |

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

## Use With Agents

Dryft works best when agents call the MCP server before editing.

Generated `.mcp.json`:

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

An agent should use the tools like this:

```text
Before editing src/auth/login.ts:
1. Call dryft_features_for_file with path="src/auth/login.ts".
2. Use the returned feature ID in the plan and summary.
3. If no feature matches, search existing features with dryft_search_features.
4. If nothing fits, add a new dryft.yml feature entry in the same change.
```

One-shot prompt for coding agents:

```text
You are working in a repository that uses Dryft as its feature map and MCP controller.

Before editing:
1. Read dryft.yml or call dryft_list_features.
2. For every file you plan to touch, call dryft_features_for_file with the repo-relative path.
3. Name the feature IDs you are touching in your plan.

While editing:
- Keep changes inside the matched feature's path boundaries when possible.
- If a new file does not match an existing feature, search with dryft_search_features before creating a new feature.
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
| `dryft_list_features` | List every feature with id, status, title, owner, and file count. |
| `dryft_get_feature` | Get one feature's metadata and matching files. |
| `dryft_features_for_file` | Find which feature or features own a file path. |
| `dryft_files_for_feature` | List all files matched by a feature's path globs. |
| `dryft_search_features` | Search feature id, title, and owner. |

## Use With Codex

This repository is also a Codex plugin source. It includes:

```text
.codex-plugin/plugin.json
.mcp.json
skills/dryft/SKILL.md
.agents/plugins/marketplace.json
```

Add the marketplace:

```sh
codex plugin marketplace add dijla-ventures-llc/dryft --ref main
```

Restart Codex, open the plugin directory, choose the `Dryft` marketplace, and install the `Dryft` plugin. The plugin bundles:

- MCP config that starts `npx -y @dijla-ventures-llc/dryft@latest mcp`
- A Codex skill that tells the agent to query the feature map before editing files

If you added the marketplace before a Dryft plugin update, refresh it:

```sh
codex plugin marketplace upgrade dryft-plugins
```

If it still does not appear, remove and re-add it, then restart Codex:

```sh
codex plugin marketplace remove dryft-plugins
codex plugin marketplace add dijla-ventures-llc/dryft --ref main
```

In a repository that uses Dryft, make sure `dryft.yml` exists. `dryft init` can generate the starter manifest and local `.mcp.json`; the Codex plugin supplies the agent behavior and MCP server definition.

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

Dryft v0.2 is MCP-first, but the CLI still includes a narrow PR drift check:

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
