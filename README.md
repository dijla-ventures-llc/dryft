# dryft

[npm package: `@dijla-ventures-llc/dryft`](https://www.npmjs.com/package/@dijla-ventures-llc/dryft)

Static analysis for feature integrity in the age of AI.

Dryft is a lightweight feature-drift guard for fast-moving, AI-assisted
engineering teams. Developers and coding agents tag changed files with feature
intent, then CI validates those tags against a checked-in feature catalog.

## Core idea

Add file-level markers near the top of source, test, config, migration, or docs
files:

```ts
// dryft:implements <feature-id>
```

```ts
// dryft:verifies <feature-id>
```

```md
<!-- dryft:relates <feature-id> -->
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

Install the package from npm:

```sh
npm install -D @dijla-ventures-llc/dryft
```

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

## GitHub Actions

After `dryft init`, pull requests can run Dryft through the first-party action
published from a dedicated Marketplace-compatible action repository:

The workflow token needs `actions: read`, `contents: read`, and
`security-events: write` permissions when uploading SARIF.

```yaml
- name: Run Dryft
  id: dryft
  continue-on-error: true
  uses: dijla-ventures-llc/dryft-action@v1
  with:
    base: origin/${{ github.base_ref }}
    format: sarif
    output: dryft.sarif
    json-output: dryft-report.json

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: dryft.sarif

- name: Upload Dryft JSON report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: dryft-report
    path: dryft-report.json
```

The action wraps `dryft ci`. It can emit SARIF for GitHub code scanning and a
JSON artifact for review, automation, or future dashboard ingestion. The action
itself should live in a separate public repository that contains a single root
`action.yml` and no workflow files, so it can be published to GitHub Marketplace.

## CI behavior

The default CI policy is balanced:

- fails unknown or archived feature markers
- fails changed source files with no Dryft marker
- warns on deprecated feature markers
- warns when implemented features have no verification marker
- warns when changed files fall outside optional feature path globs

Reports are available as terminal text, JSON, or SARIF for GitHub annotations.
