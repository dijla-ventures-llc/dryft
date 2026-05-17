# dryft

[npm package: `@dijla-ventures-llc/dryft`](https://www.npmjs.com/package/@dijla-ventures-llc/dryft)

Static analysis for feature integrity in the age of AI.

Dryft is a lightweight feature-drift guard for fast-moving, AI-assisted
engineering teams. Developers and coding agents tag changed files with feature
intent, then CI validates those tags against a checked-in feature catalog.

## Install

Use the npm package in a repository that should be checked for feature drift:

```sh
npm install -D @dijla-ventures-llc/dryft
```

The package exposes a `dryft` binary:

```sh
npx dryft init
npx dryft scan --format text
npx dryft ci --base origin/main --format json
```

Use local installs for application repos so CI and contributors run the same
Dryft version. Use `npx @dijla-ventures-llc/dryft ...` when bootstrapping a
repo that has not installed Dryft yet.

## Core Idea

Dryft uses file-level markers that can live inside any comment style. The
scanner reads line text rather than language ASTs, so the same marker vocabulary
works across TypeScript, Python, Go, SQL, Terraform, Markdown, YAML, and most
other repository files.

Use `dryft:implements` in production code that implements a feature. This tells
reviewers and CI which product capability the file belongs to.

```ts
// dryft:implements auth.magic-link.login

export async function sendMagicLink(email: string) {
  // feature implementation
}
```

Use `dryft:verifies` in tests that prove a feature still works. This lets Dryft
warn when implementation changes have no nearby verification signal.

```ts
// dryft:verifies auth.magic-link.login

test("sends a magic link to a known user", async () => {
  // feature test
});
```

Use `dryft:relates` in supporting files such as config, docs, prompts,
migrations, and workflows. This captures work that affects a feature without
pretending the file directly implements or verifies it.

```yaml
# dryft:relates auth.magic-link.login
MAGIC_LINK_TOKEN_TTL_SECONDS: 900
```

## Manifest

The manifest is the source of truth for feature IDs. Keep it checked in as
`dryft.yml`, `dryft.yaml`, or `dryft.json`.

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

Why use this: Dryft prevents agents and developers from inventing feature IDs in
random files. Optional `paths` also let CI warn when a changed file claims to
implement a feature but lives outside that feature's expected area.

Feature IDs use lowercase hierarchical segments, such as
`auth.magic-link.login`. Supported statuses are `active`, `deprecated`, and
`archived`.

## Local Usage

Initialize a repo:

```sh
npx dryft init --project "Acme App"
```

Why use this: it creates `dryft.yml`, `AGENTS.md` tagging instructions, and a
starter GitHub Actions workflow.

Scan the whole repository:

```sh
npx dryft scan --format text
```

Why use this: it is the fast local sanity check before opening a pull request.
It catches unknown feature IDs, inactive feature references, and malformed
manifests.

Generate JSON for automation:

```sh
npx dryft scan --format json > dryft-report.json
```

Why use this: JSON is the stable report format for dashboards, internal bots,
or review automation.

Run the same drift check CI runs:

```sh
npx dryft ci --base origin/main --format sarif > dryft.sarif
```

Why use this: `dryft ci` only evaluates files changed against the base ref and
applies the pull-request policy.

## GitHub Actions

After `dryft init`, pull requests can run Dryft through the first-party action:

```yaml
name: Dryft

on:
  pull_request:

jobs:
  dryft:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Dryft
        id: dryft
        continue-on-error: true
        uses: dijla-ventures-llc/dryft-action@v1
        with:
          base: origin/${{ github.base_ref }}
          format: sarif
          output: dryft.sarif
          json-output: dryft-report.json

      - name: Upload Dryft SARIF to code scanning
        if: always()
        continue-on-error: true
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: dryft.sarif

      - name: Upload Dryft SARIF artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dryft-sarif
          path: dryft.sarif

      - name: Upload Dryft JSON report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dryft-report
          path: dryft-report.json

      - name: Fail on Dryft errors
        if: steps.dryft.outcome == 'failure'
        run: exit 1
```

Why use this: the Dryft action blocks real drift, uploads a JSON report for
humans and future dashboards, and optionally feeds SARIF into GitHub Code
Scanning.

The JSON report is uploaded to the workflow run as an artifact named
`dryft-report`. Open the GitHub Actions run, scroll to **Artifacts**, and
download `dryft-report.zip`.

The SARIF file is uploaded two ways:

- `dryft-sarif` artifact: always available on the workflow run.
- Code Scanning upload: visible under GitHub **Security > Code scanning** only
  when the repository has code scanning support enabled. If GitHub returns
  "Advanced Security must be enabled," the artifact still exists and the Dryft
  pass/fail result still works.

## CI Behavior

The default CI policy is balanced:

- fails unknown or archived feature markers
- fails changed source files with no Dryft marker
- warns on deprecated feature markers
- warns when implemented features have no verification marker
- warns when changed files fall outside optional feature path globs

Reports are available as terminal text, JSON, or SARIF.

## Agent Prompt

Use this one-shot prompt when asking an AI coding agent to implement a feature
in a Dryft-enabled repo:

```text
You are implementing a feature in a repository that uses Dryft.

Before editing code:
1. Read dryft.yml.
2. Identify the existing feature ID that matches this work.
3. If no existing feature fits, update dryft.yml in the same change.

While editing:
- Add or preserve dryft:implements <feature-id> near the top of every changed
  production source file.
- Add or preserve dryft:verifies <feature-id> near the top of every changed test
  file.
- Add or preserve dryft:relates <feature-id> near the top of every changed
  config, migration, workflow, prompt, or documentation file.
- Do not invent feature IDs in code without also updating dryft.yml.

Before finishing:
1. Run npx @dijla-ventures-llc/dryft scan --format text.
2. Fix unknown, inactive, missing, or path-drift markers.
3. Summarize which feature IDs were touched.
```
