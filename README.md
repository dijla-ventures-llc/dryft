# Dryft

**A queryable feature index your AI agents read before editing your codebase.**

[![npm](https://img.shields.io/npm/v/%40dijla-ventures-llc%2Fdryft)](https://www.npmjs.com/package/@dijla-ventures-llc/dryft) · Apache-2.0

## What it does

Modern AI coding agents (Claude Code, Cursor, Codex, Aider) invent a new naming convention every PR because `CLAUDE.md` is unstructured prose. Dryft replaces that prose with a structured `dryft.yml` manifest mapping features → path globs, and exposes those mappings as MCP tools agents can call before editing.

When an agent is about to edit `src/auth/login.ts`, it asks Dryft *"what feature does this file belong to?"* and gets back `auth.magic-link.login` — the exact id the manifest declared. No drift, no invented synonyms, no fragmented architecture.

## Quick start

### 1. Generate a manifest

With `ANTHROPIC_API_KEY` set:

```sh
npx @dijla-ventures-llc/dryft init --infer
```

This asks Claude to propose a feature taxonomy by reading your repo's file tree, then writes `dryft.yml`. Review the output; tweak as needed.

Or start from a hand-edited template:

```sh
npx @dijla-ventures-llc/dryft init
```

### 2. Wire the MCP server into your agent

**Claude Code** — add to `.mcp.json` at the repo root:

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

**Cursor** — add the same block to `.cursor/mcp.json`.

**Codex** — add this repo to a plugin marketplace, then install Dryft via the plugin directory. The plugin ships a `SKILL.md` that teaches Codex when to call each tool.

### 3. Verify

Restart your agent. Ask *"what features does this repo have?"* — the agent should call `dryft_list_features` and respond with the manifest's contents.

## MCP tools

| Tool | Use |
|---|---|
| `dryft_list_features` | List every feature (id, status, title, file count, owner). |
| `dryft_get_feature` | Full details for one feature, including its files. |
| `dryft_features_for_file` | Find the feature(s) a file belongs to. Call this before editing any file. |
| `dryft_files_for_feature` | List all files that match a feature's path globs. |
| `dryft_search_features` | Substring search across id, title, and owner. |

## CLI

Same queries, terminal flavor (Markdown by default, `--format json` for machine output):

```sh
dryft context list                                  # tabular feature list
dryft context feature auth.magic-link.login         # full feature detail
dryft context file src/auth/login.ts                # features for a file
dryft context search login                          # substring search
dryft scan                                          # manifest sanity + summary
dryft mcp                                           # start the MCP server (stdio)
```

## The manifest

`dryft.yml`, `dryft.yaml`, or `dryft.json` at the repo root:

```yaml
project:
  name: my-app
features:
  - id: auth.magic-link.login          # lowercase hierarchical
    title: Magic link login
    status: active                     # active | deprecated | archived
    owner: platform                    # optional
    paths:                             # picomatch globs
      - src/auth/**
      - test/auth/**
  - id: billing.checkout
    title: Checkout flow
    status: active
    paths:
      - src/billing/**
```

Feature ids use lowercase hierarchical segments (dots between segments, kebab-case within a segment): `auth.magic-link.login`, `core.observability`, `ops.cron.nightly-cleanup`.

Features without `paths` are still listable but won't auto-resolve from a file path. Add `paths` to make a feature actually findable.

## Quality gates (optional)

If you want CI checks for change scope, `dryft ci --base origin/main` reports two kinds of issues:

- `archived-feature-touched` (error) — a changed file matches an archived feature's paths.
- `deprecated-feature-touched` (warning) — a changed file matches a deprecated feature's paths.

That's the whole gate. Dryft does **not** enforce "every file must declare a feature" — the manifest's path globs decide membership.

Wire it into GitHub Actions via the [`dryft-action`](https://github.com/dijla-ventures-llc/dryft-action) wrapper:

```yaml
- uses: dijla-ventures-llc/dryft-action@v1
  with:
    base: origin/${{ github.base_ref }}
    format: sarif
    output: dryft.sarif
```

See the [dryft-action](https://github.com/dijla-ventures-llc/dryft-action) README for the full PR workflow template (SARIF upload, JSON report artifact, etc.).

## Why this exists

- **One source of truth for feature names.** No more "is it `checkout`, `cart-checkout`, or `billing.checkout`?" — the manifest decides.
- **Agents stay in scope.** Before editing, they query Dryft and align with the existing taxonomy instead of inventing parallel names.
- **Cheap to maintain.** Just path globs in a YAML file. No inline markers, no agent-side bookkeeping.
- **Distribution-ready.** Ships as an npm package (CLI + MCP server) and a Codex/Claude-Code plugin (one-click install via marketplace).

## Install paths

- **npm package** (CLI + MCP server): `npm i -D @dijla-ventures-llc/dryft`
- **Codex / Claude Code plugin**: point your marketplace at this repo

## Limits

- Path globs are the only relationship type. If you need to distinguish "this file *implements* feature X" from "this file *tests* feature X," use separate path conventions (e.g., `src/auth/**` for impl, `test/auth/**` for tests) — Dryft doesn't model roles directly.
- The MCP server caches the index in memory after first build. If you edit `dryft.yml`, restart the server.
- The LLM-based `--infer` is best-effort; review the output before committing.

## License

Apache-2.0. Copyright 2026 Dijla Ventures LLC.
