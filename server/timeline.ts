import type { PluginHandlerContext } from "@getpaseo/plugin/server";

export async function turnItems(
  paseo: PluginHandlerContext["paseo"],
  agentId: string,
  turnId: string | null,
  previous?: { epoch: string; maxSeq: number },
): Promise<{ items: unknown[]; timeline: { epoch: string; maxSeq: number } }> {
  if (!turnId) throw new Error("The agent backend gave no turn id, so this turn's edits cannot be separated reliably.");
  const timeline = paseo.agents.ref(agentId).timeline;
  let page = await timeline.refetch({ limit: 200, projection: "canonical" });
  const epoch = page.epoch;
  const minimum = previous?.epoch === epoch ? previous.maxSeq : -1;
  const selected: typeof page.entries = [];
  let found = false;
  for (let count = 0; count < 50; count++) {
    if (page.error || page.gap || page.staleCursor || page.epoch !== epoch)
      throw new Error("The conversation timeline changed or is incomplete. Re-check this turn's changes.");
    let boundary = false;
    for (const entry of [...page.entries].reverse()) {
      if (entry.seqEnd <= minimum) {
        boundary = true;
        break;
      }
      if (entry.turnId === turnId) {
        selected.unshift(entry);
        found = true;
      } else if (found && entry.turnId) {
        boundary = true;
        break;
      }
    }
    if (boundary || !page.hasOlder) {
      if (!found) throw new Error("The complete timeline for this turn was not found.");
      const calls = new Map<string, { seq: number; item: unknown }>();
      for (const entry of selected) {
        if (entry.item.type !== "tool_call") continue;
        const previous = calls.get(entry.item.callId);
        if (!previous || previous.seq <= entry.seqEnd)
          calls.set(entry.item.callId, { seq: entry.seqEnd, item: entry.item });
      }
      const maxSeq = selected.reduce((value, entry) => Math.max(value, entry.seqEnd), 0);
      return {
        items: [...calls.values()].sort((a, b) => a.seq - b.seq).map((value) => value.item),
        timeline: { epoch, maxSeq },
      };
    }
    if (!page.startCursor) throw new Error("The conversation timeline is missing a page cursor.");
    page = await timeline.refetch({
      limit: 200,
      projection: "canonical",
      direction: "before",
      cursor: page.startCursor,
    });
  }
  throw new Error("This turn's timeline is too long, the edit history is incomplete.");
}
