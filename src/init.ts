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
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 20",
    "      - run: npm install -g dryft",
    "      - run: dryft ci --base origin/${{ github.base_ref }} --format sarif > dryft.sarif",
    "      - uses: github/codeql-action/upload-sarif@v3",
    "        if: always()",
    "        with:",
    "          sarif_file: dryft.sarif",
    ""
  ].join("\n");
}
