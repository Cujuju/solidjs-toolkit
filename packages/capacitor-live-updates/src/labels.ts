/** A bundle label's rev: "3.0.0-r612" → 612. Null when the label carries none. */
export function bundleLabelRev(label: string): number | null {
  const m = /-r(\d+)$/.exec(label);
  return m ? Number(m[1]) : null;
}

/** The native app's rev and fingerprint, from its updater `version` ("3.0.0-r612-1a2b3c4d5e6f"). */
export function parseNativeVersion(version: string): { rev: number; fingerprint: string } | null {
  const m = /-r(\d+)-([0-9a-f]{12})$/.exec(version);
  return m ? { rev: Number(m[1]), fingerprint: m[2] } : null;
}
