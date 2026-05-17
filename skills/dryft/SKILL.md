---
name: dryft
description: Query the project's feature index before editing code. Use the Dryft MCP tools to find which feature a file belongs to, list all features, and look up details from dryft.yml.
---

This project uses Dryft to maintain a queryable feature index. A `dryft.yml` file at the repo root declares the logical features in the codebase, each with path globs that define which files belong to each feature.

Before editing any file, use the Dryft MCP tools to understand which feature or features the file belongs to. Use this to keep changes coherent with the existing taxonomy instead of inventing new feature names ad hoc.

## Tools

- `dryft_list_features`: list all features with id, status, title, owner, and file count.
- `dryft_get_feature` with `id`: get full details for one feature, including status, owner, path globs, and member files.
- `dryft_features_for_file` with `path`: return the feature or features a repo-relative file belongs to. Use this before editing any file.
- `dryft_files_for_feature` with `id`: list all files that belong to a feature.
- `dryft_search_features` with `query`: search feature id, title, and owner.

## When To Use

- Before editing a file: call `dryft_features_for_file` to learn which feature you are touching.
- Before adding a new file: call `dryft_list_features` or `dryft_search_features` to find an existing feature it should join. If nothing fits, add a new entry to `dryft.yml` in the same commit.
- When the user asks what a feature does: call `dryft_get_feature` to summarize the feature's purpose and member files.
- When refactoring across features: start with `dryft_list_features` to see the full taxonomy before deciding scope.

## Updating The Manifest

If a new capability has no existing feature, append to `dryft.yml`:

```yaml
- id: <lowercase.hierarchical.id>
  title: <Short Title>
  status: active
  paths:
    - <glob covering new files>
```

Then re-invoke `dryft_list_features` to confirm the new feature is recognized.

## Fallback

If the Dryft MCP server is not running, read `dryft.yml` directly. Match files to features by checking each feature's `paths` globs against the file path.
