import type { DryftMarker, MarkerRole } from "./types.js";

const MARKER_PATTERN =
  /\bdryft:(implements|verifies|relates)\s+([a-zA-Z0-9_.-]+)\b/g;

export function parseMarkers(content: string, file: string): DryftMarker[] {
  const markers: DryftMarker[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    for (const match of lineText.matchAll(MARKER_PATTERN)) {
      markers.push({
        role: match[1] as MarkerRole,
        featureId: match[2],
        file,
        line: index + 1,
        column: (match.index ?? 0) + 1,
        raw: match[0]
      });
    }
  });

  return markers;
}
