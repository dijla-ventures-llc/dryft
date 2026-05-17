# Changelog

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
