---
name: dryft
description: Plan and verify code changes against the project's Dryft feature map.
---

This project uses Dryft to maintain a queryable feature index. A `dryft.yml` file at the repo root declares the logical features in the codebase, each with path globs that define which files belong to each feature.

Before editing, use Dryft to plan the change against the feature map. Before finishing, use Dryft to verify the actual git changes against that plan. Dryft works best after the repository has a reviewed `dryft.yml`; if the manifest is missing or obviously incomplete, ask to initialize or update it before relying on the results.

## Tools

- `dryft_plan_change` with `intent` and `files`: plan a change before editing. Use this first whenever you know the goal and likely files. Save the returned `changeId`.
- `dryft_verify_change` with `changeId`, optional `intent`, optional `plannedFiles`, and optional `baseRef`: verify actual git changes before final response. Prefer the persistent `changeId` from `dryft_plan_change`.
- `dryft_list_features`: list all features with id, status, title, owner, and file count.
- `dryft_get_feature` with `id`: get full details for one feature, including status, owner, path globs, and member files.
- `dryft_features_for_file` with `path`: return the feature or features a repo-relative file belongs to. Use this before editing any file.
- `dryft_files_for_feature` with `id`: list all files that belong to a feature.
- `dryft_search_features` with `query`: search feature id, title, and owner.

## When To Use

- Before editing files: call `dryft_plan_change` with a short intent and the repo-relative files you expect to touch, then keep the returned `changeId`.
- Before final response after editing files: call `dryft_verify_change` with the `changeId`. Include the Dryft Receipt in the final response. Summarize `verified`, explain `needs_review`, review any manifest patch suggestions for `needs_manifest_update`, and stop for `blocked_archived`.
- Before adding a new file: call `dryft_list_features` or `dryft_search_features` to find an existing feature it should join. If nothing fits, add a new entry to `dryft.yml` in the same commit.
- When the user asks what a feature does: call `dryft_get_feature` to summarize the feature's purpose and member files.
- When refactoring across features: start with `dryft_list_features` to see the full taxonomy before deciding scope.
- Use lower-level tools like `dryft_features_for_file` after `dryft_plan_change` when you need detail on a specific file.

## Updating The Manifest

If a new capability has no existing feature, append to `dryft.yml`:

```yaml
- id: <lowercase.hierarchical.id>
  title: <Short Title>
  status: active
  paths:
    - <glob covering new files>
```

Then re-invoke `dryft_plan_change` to confirm the planned files are recognized and save the new `changeId`. After editing, re-invoke `dryft_verify_change` before final response.

If Dryft returns a suggested `dryft.yml` patch for an unowned file, treat it as a starting point. Adjust the feature id, title, owner, and paths so the manifest reflects the repo's real product boundaries.

## Fallback

If the Dryft MCP server is not running, read `dryft.yml` directly. Match files to features by checking each feature's `paths` globs against the file path. Before finishing, compare the actual git diff with the files you planned to touch and call out any extra feature areas or unowned files.
