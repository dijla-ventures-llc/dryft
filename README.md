# Dryft

**A queryable feature index for AI coding agents.**

[![npm](https://img.shields.io/npm/v/%40dijla-ventures-llc%2Fdryft)](https://www.npmjs.com/package/@dijla-ventures-llc/dryft)

Dryft gives coding agents a structured map of the features in a repository before they edit files. Instead of relying on stale prose docs, agents can ask Dryft which feature owns a path, which files belong to a feature, and what feature IDs already exist.

The wedge is simple: agents read the feature map first, then stay inside the product boundary they are changing.

## Install

```sh
npm install -D @dijla-ventures-llc/dryft
```

Initialize a feature manifest and local MCP config:

```sh
npx dryft init
```

This writes:

- `dryft.yml`: the feature map
- `AGENTS.md`: agent instructions
- `.mcp.json`: local MCP config for agents that read repo MCP settings

## Quick Start

List the features in the repo:

```sh
npx dryft context list
```

Find which feature owns a file:

```sh
npx dryft context file src/auth/login.ts
```

Inspect one feature:

```sh
npx dryft context feature auth.magic-link.login
```

Start the MCP server:

```sh
npx dryft mcp
```

## MCP

Dryft exposes these MCP tools:

| Tool | Use |
| --- | --- |
| `dryft_list_features` | List every feature with id, status, title, file count, and owner. |
| `dryft_get_feature` | Get full details for one feature, including matching files. |
| `dryft_features_for_file` | Find the feature or features a file belongs to. Agents should call this before editing. |
| `dryft_files_for_feature` | List all files that match a feature's path globs. |
| `dryft_search_features` | Search feature id, title, and owner. |

Example MCP config:

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

## Codex Plugin

This repository is also a Codex plugin source. It includes:

```text
.codex-plugin/plugin.json
.mcp.json
skills/dryft/SKILL.md
.agents/plugins/marketplace.json
```

Add the plugin marketplace:

```sh
codex plugin marketplace add dijla-ventures-llc/dryft --ref main
```

Then install Dryft from the Codex plugin directory. The plugin bundles the MCP config and a skill that instructs Codex to query Dryft before editing files.

## Manifest

`dryft.yml`, `dryft.yaml`, or `dryft.json` is the source of truth:

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
    paths:
      - src/billing/**
```

Feature IDs use lowercase hierarchical segments, such as `auth.magic-link.login`, `core.observability`, or `ops.cron.nightly-cleanup`.

Supported statuses:

- `active`: current feature area
- `deprecated`: still present but should be handled carefully
- `archived`: should not receive new changes

Features without `paths` are visible in listings but cannot be resolved from file paths. Add `paths` to make a feature useful to agents.

## CLI

```sh
dryft init [--project <name>]
dryft init --infer [--model <id>] [--dry-run]
dryft scan [--format text|json|sarif]
dryft ci --base <ref> [--format text|json|sarif]
dryft context list [--format text|json]
dryft context feature <id> [--format text|json]
dryft context file <path> [--format text|json]
dryft context search <query> [--format text|json]
dryft mcp
```

`dryft init --infer` is optional. It uses `ANTHROPIC_API_KEY` to ask a model to propose an initial feature map from the repo file tree. Review the generated manifest before committing it.

## Drift Checks

The core agent workflow is MCP-first, but the CLI can still evaluate pull request changes:

```sh
npx dryft ci --base origin/main
```

The v0.2 policy is intentionally narrow:

- `archived-feature-touched`: error when a changed file matches an archived feature
- `deprecated-feature-touched`: warning when a changed file matches a deprecated feature

`dryft scan` validates the manifest and summarizes feature file counts:

```sh
npx dryft scan --format text
npx dryft scan --format json
```

## Why This Exists

- Agents can query feature ownership before editing.
- Teams get one stable vocabulary for product and platform areas.
- The manifest is cheap to maintain because path globs do the mapping.
- The same feature index works through CLI, MCP, and Codex plugin surfaces.

## Limits

- Feature membership is path-based.
- The MCP server caches the feature index after startup. Restart it after editing `dryft.yml`.
- Generated manifests from `--infer` are a bootstrap aid, not a source of truth until reviewed.

## License

Apache-2.0. Copyright 2026 Dijla Ventures LLC.
