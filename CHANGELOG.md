# Changelog

## 0.2.0

**Reposition: feature drift checker → queryable feature index for AI agents.**

### Added

- `dryft mcp` — Model Context Protocol server exposing the feature index over stdio. Tools: `dryft_list_features`, `dryft_get_feature`, `dryft_features_for_file`, `dryft_files_for_feature`, `dryft_search_features`. Resource: `dryft://manifest` for clients that support it.
- `dryft context list | feature <id> | file <path> | search <query>` — terminal-friendly Markdown queries against the same index. `--format json` for machine output.
- `dryft init --infer [--model <id>] [--dry-run]` — bootstrap a `dryft.yml` by asking Claude (Sonnet 4.6 by default) to propose a feature taxonomy from the repo's file tree. Reads `ANTHROPIC_API_KEY` from env.
- Codex plugin packaging at the repo root: `.codex-plugin/plugin.json`, `.mcp.json`, `skills/dryft/SKILL.md`. Installable via plugin marketplace; also compatible with the Claude Code plugin format.
- New public exports: `runMcp`, `createMcpServer`, `runInfer`, `buildFeatureIndex`, `computeFeatureIndex`, `featuresForFile`, `filesForFeature`, `getFeature`, `listFeatures`, `searchFeatures`, `parseManifestContent`, plus the new types.

### Removed (breaking)

- `dryft:implements` / `dryft:verifies` / `dryft:relates` markers. The marker concept is gone. Path globs in `dryft.yml` are now the only source of truth for feature membership.
- `parseMarkers`, `DryftMarker`, `FeatureReferences`, `MarkerRole`, `FeatureMembership`, `FileMembership`, `MembershipSource` types and helpers.
- `DryftIssue` codes shrunk from 7 → 3. Gone: `missing-marker`, `unknown-feature`, `path-affinity-mismatch`, `missing-verification`, `deprecated-feature`, `inactive-feature`. Remaining: `invalid-manifest`, `deprecated-feature-touched`, `archived-feature-touched`.

### Changed

- `dryft scan` no longer reads file contents. It walks the repo and groups files by path globs.
- `dryft ci` no longer fails on unmarked files. It only flags `deprecated-feature-touched` (warning) and `archived-feature-touched` (error) based on which features the changed paths touch.
- README full rewrite leading with the AI context provider pitch.
- Engines minimum bumped: `node >= 24` (was `node >= 20`).
- Dependency bumps: TypeScript 6.0.3, @types/node 25.8, yaml 2.9, picomatch 4.0.4.
- New dependencies: `@modelcontextprotocol/sdk` ^1.29, `@anthropic-ai/sdk` ^0.96.

### Migration from 0.1.x

- Delete inline `dryft:*` marker comments from your source files. The parser no longer recognizes them; they become regular comments.
- Make sure every feature in `dryft.yml` has a `paths` glob — that is now the only way Dryft maps files to features.
- If your CI gated on `missing-marker` errors, those errors are gone. Replace with whatever workflow check you actually need.
- Bump your CI runner's Node version to 24 to match the new engines floor.

## 0.1.3

Marker-based feature tracking. See git history for prior releases.
