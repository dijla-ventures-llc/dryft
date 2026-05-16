# dryft

Static analysis for feature integrity in the age of AI.

Dryft is a lightweight feature-drift guard for fast-moving, AI-assisted
engineering teams. Developers and coding agents tag changed files with feature
intent, then CI validates those tags against a checked-in feature catalog.

## Core idea

Add file-level markers near the top of source, test, config, migration, or docs
files:

```ts
// dryft:implements auth.magic-link.login
```

```ts
// dryft:verifies auth.magic-link.login
```

```md
<!-- dryft:relates auth.magic-link.login -->
```

Dryft scans line text, not language ASTs, so the same marker vocabulary works
across TypeScript, Python, Go, SQL, Terraform, Markdown, and most other
repository files.

## Manifest

Define known features in `dryft.yml`, `dryft.yaml`, or `dryft.json`:

```yaml
project:
  name: Example
features:
  - id: auth.magic-link.login
    title: Magic link login
    status: active
    owner: platform
    paths:
      - src/auth/**
      - test/auth/**
```

Feature IDs use lowercase hierarchical segments, such as
`auth.magic-link.login`. Supported statuses are `active`, `deprecated`, and
`archived`.

## CLI

```sh
dryft init
dryft scan --format text
dryft scan --format json
dryft ci --base origin/main --format sarif
```

`dryft init` creates a starter manifest, agent tagging instructions, and a
GitHub Actions workflow template. `dryft scan` builds the feature-reference
graph for the repository. `dryft ci` evaluates changed files against a base ref
and is intended for pull request checks.

## CI behavior

The default CI policy is balanced:

- fails unknown or archived feature markers
- fails changed source files with no Dryft marker
- warns on deprecated feature markers
- warns when implemented features have no verification marker
- warns when changed files fall outside optional feature path globs

Reports are available as terminal text, JSON, or SARIF for GitHub annotations.
