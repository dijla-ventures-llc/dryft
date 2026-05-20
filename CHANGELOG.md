# Changelog

## 0.4.0

### Added

- `dryft_verify_change` MCP tool for post-edit verification. Agents can compare actual git changes against the files they planned to touch before final response.
- Persistent local change contracts: `dryft_plan_change` now returns a `changeId`, and `dryft_verify_change` can verify against that saved contract even after an MCP restart.
- Dryft Receipt output for agent final responses and review summaries.
- Suggested `dryft.yml` patch output for unowned files in plan and verification results.
- Structured verification output with actual files, planned and actual features, unplanned files, unowned files, risks, and next steps.
- Public exports for change plan, change contract, and manifest patch suggestion types.

### Changed

- README now documents the full agent loop: plan before editing, verify before finishing.
- Codex skill and generated agent instructions now direct agents to save `changeId`, call `dryft_verify_change` after editing, and include the Dryft Receipt before final response.

## 0.3.0

### Added

- `dryft_plan_change` MCP tool for agent pre-edit planning with intent, planned files, feature ownership, risks, next steps, and structured MCP output.

### Changed

- README now leads with Codex and Claude Code setup for AI coding agents.
- Codex skill and generated agent instructions now direct agents to call `dryft_plan_change` before editing.
- Codex plugin metadata now uses `Dijla Ventures LLC` consistently as the developer name.

## 0.2.2

### Fixed

- Updated Codex plugin marketplace metadata so the Dryft marketplace points at the repo-root plugin through the Git-backed plugin source.
- Documented Codex marketplace refresh and reinstall steps for users who added the marketplace before the plugin metadata update.

## 0.2.1

### Fixed

- `dryft_features_for_file` now resolves feature ownership directly from manifest path globs, even when the file is new, large, or otherwise absent from the scanned file index.

## 0.2.0

**Reposition: Dryft is now a queryable feature index and MCP context provider for AI agents.**

### Added

- `dryft mcp`: Model Context Protocol server exposing the feature index over stdio.
- MCP tools: `dryft_list_features`, `dryft_get_feature`, `dryft_features_for_file`, `dryft_files_for_feature`, and `dryft_search_features`.
- `dryft context list | feature <id> | file <path> | search <query>` for terminal-friendly feature queries.
- `dryft init --infer [--model <id>] [--dry-run]` for optional manifest bootstrap from a repository file tree.
- Codex plugin packaging at the repository root: `.codex-plugin/plugin.json`, `.mcp.json`, `skills/dryft/SKILL.md`, and `.agents/plugins/marketplace.json`.
- Public exports for the feature index, MCP server, infer command, manifest parsing, and reporters.

### Changed

- `dryft.yml` path globs are the source of truth for feature membership.
- `dryft scan` walks the repository and summarizes feature file counts by path glob.
- `dryft ci` checks changed paths against deprecated and archived feature areas.
- README now leads with the MCP and Codex plugin workflow.
- Minimum runtime is now Node.js 24.

### Removed

- The old file-content annotation parser and related public types.
- The old CI policy that required per-file inline annotations.
- GitHub Action workflow generation from `dryft init`.

### Migration from 0.1.x

- Ensure each feature in `dryft.yml` has useful `paths` globs.
- Replace old workflow assumptions with the MCP-first flow:
  - agents call `dryft_features_for_file` before editing;
  - humans use `dryft context ...` to inspect the same feature map;
  - CI can optionally run `dryft ci --base origin/main`.
- Use Node.js 24 or newer.
