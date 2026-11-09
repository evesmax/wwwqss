// Pure alert rules: which thresholds a metric has crossed and who must be told (RF-SLA-06).
export type Target = "assignee" | "manager" | "owner";
export type Escalation = Record<string, Record<string, Target[]>>; // severity -> threshold -> targets
export const THRESHOLDS = [50, 75, 90, 100] as const;

export const DEFAULT_ESCALATION: Escalation = {
  P0: { "50": ["assignee"], "75": ["assignee"], "90": ["assignee", "manager"], "100": ["assignee", "manager", "owner"] },
  P1: { "50": ["assignee"], "75": ["assignee"], "90": ["assignee", "manager"], "100": ["assignee", "manager", "owner"] },
  default: { "90": ["assignee"], "100": ["assignee", "manager"] },
};

/** Thresholds reached by `pct` (0..n). 100 means the target is exceeded. */
export function thresholdsCrossed(pctUsed: number, breached: boolean): number[] {
  return THRESHOLDS.filter((t) => (t === 100 ? breached : pctUsed >= t / 100));
}
export function targetsFor(esc: Escalation, severity: string | null, threshold: number): Target[] {
  const row = (severity && esc[severity]) || esc.default || {};
  return row[String(threshold)] ?? [];
}
