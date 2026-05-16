import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkers } from "../src/markers.js";

test("parses dryft markers from common comment styles", () => {
  const markers = parseMarkers(
    [
      "// dryft:implements auth.magic-link.login",
      "# dryft:verifies auth.magic-link.login",
      "/* dryft:relates billing.checkout */",
      "<!-- dryft:implements docs.onboarding -->"
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
    "// dryft:depends auth.magic-link.login",
    "src/example.ts"
  );

  assert.deepEqual(markers, []);
});
