---
name: dryft
description: Query the project's feature index before editing code. Use the dryft MCP tools to find which feature a file belongs to, list all features, and look up details from dryft.yml.
---

This project uses **Dryft** to maintain a queryable feature index. A `dryft.yml` file at the repo root declares the logical features in the codebase, each with a set of path globs that define which files belong to it.

Before editing any file, use the dryft MCP tools to understand which feature(s) the file belongs to. Use this to keep your changes coherent with the existing taxonomy instead of inventing new feature names ad hoc.

## Tools

- `dryft_list_features` — list all features (id, status, title, owner, file count).
- `dryft_get_feature` (id) — full details for one feature: status, owner, paths globs, member files.
- `dryft_features_for_file` (path) — given a repo-relative file path, return the feature(s) it belongs to. **Use this before editing any file.**
- `dryft_files_for_feature` (id) — list all files that belong to a feature.
- `dryft_search_features` (query) — substring search across id, title, and owner.

## When to use

- **Before editing a file:** call `dryft_features_for_file` to learn which feature you are touching. Mention it in your PR description.
- **Before adding a new file:** call `dryft_list_features` or `dryft_search_features` to find an existing feature it should join. If nothing fits, add a new entry to `dryft.yml` in the same commit.
- **When the user asks "what does X do?":** call `dryft_get_feature` to summarize the feature's purpose and member files.
- **When refactoring across features:** start with `dryft_list_features` to see the full taxonomy before deciding scope.

## Updating the manifest

If a new capability has no existing feature, append to `dryft.yml`:

```
- id: <lowercase.hierarchical.id>
  title: <Short Title>
  status: active
  paths:
    - <glob covering new files>
```

Then re-invoke `dryft_list_features` to confirm the new feature is recognized.

## Fallback

If the dryft MCP server is not running, read `dryft.yml` directly. Match files to features by checking each feature's `paths` globs against the file path.
