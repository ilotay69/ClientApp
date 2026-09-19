/** Presentation policy shared by CG controls, independent of React and data fetching. */
export function canAnimateWorkspaceMetric(source: string): boolean {
  return ["my_tasks", "my_personal_tasks", "active_projects"].includes(source);
}

export function noticeTimeout(error: boolean, hasAction: boolean): number {
  return error || hasAction ? 0 : 6000;
}

export function boundedWholeNumber(
  value: number | null,
  min: number,
  max: number,
): number | null {
  return value !== null && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : null;
}
