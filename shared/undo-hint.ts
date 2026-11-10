import type { Summary } from "./contracts";

export function undoHint(summary: Summary): string | undefined {
  if (summary.canUndo) return undefined;
  if (summary.undoneAt) return "This turn's changes have been undone.";
  if (!summary.finishedAt) return "The turn is still running; it can be undone once it ends.";
  const reasons = [
    ...new Set([...summary.issues, ...summary.files.map((file) => file.issue)]),
  ].filter((reason): reason is string => Boolean(reason));
  return reasons.length
    ? `Cannot undo:\n${reasons.join("\n")}`
    : summary.files.length
      ? "No complete before/after snapshot, so automatic undo is unavailable."
      : "This turn has no file changes to undo.";
}
