// dryft:implements core.init
export function createStarterManifest(projectName = "dryft-project"): string {
  return [
    "project:",
    `  name: ${projectName}`,
    "features:",
    "  - id: auth.magic-link.login",
    "    title: Magic link login",
    "    status: active",
    "    owner: platform",
    "    paths:",
    "      - src/auth/**",
    "      - test/auth/**",
    ""
  ].join("\n");
}

export function createAgentInstructions(): string {
  return [
    "# Dryft Feature Index",
    "",
    "This repository uses Dryft to track features. The `dryft.yml` manifest is the source of truth for what features exist and which paths belong to them.",
    "",
    "## When editing code",
    "",
    "1. Before editing, identify the feature(s) your changes belong to. If a Dryft MCP server is available, call `dryft_features_for_file` with the file path. Otherwise read `dryft.yml` and match the file against each feature's `paths` globs.",
    "2. If your change spans an existing feature, keep working — the manifest already covers you.",
    "3. If your change introduces a new capability that doesn't fit any existing feature, add a new entry under `features:` in `dryft.yml` in the same commit. Use a lowercase hierarchical id (e.g., `auth.magic-link.login`) and a `paths:` glob that covers the new files.",
    "4. If you touch a `deprecated` or `archived` feature, surface this in your PR description.",
    "",
    "## One-shot prompt for coding agents",
    "",
    "You are implementing a feature in a repository that uses Dryft. Before editing code, read `dryft.yml` (or call `dryft_list_features` / `dryft_features_for_file` if a Dryft MCP server is registered) to identify which features your changes belong to. If your change adds a new capability that no existing feature covers, add a new feature entry to `dryft.yml` in the same commit using a lowercase hierarchical id and a `paths:` glob covering the new files. When finished, run `npx @dijla-ventures-llc/dryft scan` to confirm the manifest is valid.",
    ""
  ].join("\n");
}

export function createGithubWorkflow(): string {
  return [
    "name: Dryft",
    "",
    "on:",
    "  pull_request:",
    "",
    "jobs:",
    "  dryft:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      actions: read",
    "      contents: read",
    "      security-events: write",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    "      - name: Run Dryft",
    "        id: dryft",
    "        continue-on-error: true",
    "        uses: dijla-ventures-llc/dryft-action@v1",
    "        with:",
    "          base: origin/${{ github.base_ref }}",
    "          format: sarif",
    "          output: dryft.sarif",
    "          json-output: dryft-report.json",
    "      - name: Upload Dryft SARIF to code scanning",
    "        if: always()",
    "        continue-on-error: true",
    "        uses: github/codeql-action/upload-sarif@v3",
    "        with:",
    "          sarif_file: dryft.sarif",
    "      - name: Upload Dryft SARIF artifact",
    "        if: always()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: dryft-sarif",
    "          path: dryft.sarif",
    "      - name: Upload Dryft JSON report",
    "        if: always()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: dryft-report",
    "          path: dryft-report.json",
    "      - name: Fail on Dryft errors",
    "        if: steps.dryft.outcome == 'failure'",
    "        run: exit 1",
    ""
  ].join("\n");
}
