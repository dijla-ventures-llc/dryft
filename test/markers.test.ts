// dryft:verifies core.markers
import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkers } from "../src/markers.js";

const marker = (role: string, featureId: string): string =>
  `dryft:${role} ${featureId}`;

test("parses dryft markers from common comment styles", () => {
  const markers = parseMarkers(
    [
      `// ${marker("implements", "auth.magic-link.login")}`,
      `# ${marker("verifies", "auth.magic-link.login")}`,
      `/* ${marker("relates", "billing.checkout")} */`,
      `<!-- ${marker("implements", "docs.onboarding")} -->`
    ].join("\n"),
    "src/example.ts"
  );

  assert.deepEqual(
    markers.map((marker) => ({
      role: marker.role,
      featureId: marker.featureId,
      line: marker.line
    })),
    [
      { role: "implements", featureId: "auth.magic-link.login", line: 1 },
      { role: "verifies", featureId: "auth.magic-link.login", line: 2 },
      { role: "relates", featureId: "billing.checkout", line: 3 },
      { role: "implements", featureId: "docs.onboarding", line: 4 }
    ]
  );
});

test("ignores unsupported marker roles", () => {
  const markers = parseMarkers(
    `// ${marker("depends", "auth.magic-link.login")}`,
    "src/example.ts"
  );

  assert.deepEqual(markers, []);
});

test("ignores markers inside markdown fenced code examples", () => {
  const markers = parseMarkers(
    [
      "# Usage",
      "",
      "```ts",
      `// ${marker("implements", "docs.example")}`,
      "```",
      "",
      `<!-- ${marker("relates", "docs.real")} -->`
    ].join("\n"),
    "README.md"
  );

  assert.deepEqual(
    markers.map((marker) => ({
      role: marker.role,
      featureId: marker.featureId,
      line: marker.line
    })),
    [{ role: "relates", featureId: "docs.real", line: 7 }]
  );
});
