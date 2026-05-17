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
    "# Dryft Feature Tagging",
    "",
    "When adding or changing feature code, include a file-level Dryft marker near the top of each changed source or test file.",
    "",
    "Use these markers:",
    "",
    "- `dryft:implements <feature-id>` for production code that implements a feature.",
    "- `dryft:verifies <feature-id>` for tests that verify a feature.",
    "- `dryft:relates <feature-id>` for config, docs, migrations, or supporting files.",
    "",
    "Feature IDs are defined in `dryft.yml` and use lowercase hierarchical names such as `auth.magic-link.login`.",
    "Do not invent feature IDs. If no existing feature fits, update `dryft.yml` in the same change.",
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
    "      - uses: github/codeql-action/upload-sarif@v3",
    "        if: always()",
    "        with:",
    "          sarif_file: dryft.sarif",
    "      - name: Fail on Dryft errors",
    "        if: steps.dryft.outcome == 'failure'",
    "        run: exit 1",
    ""
  ].join("\n");
}
