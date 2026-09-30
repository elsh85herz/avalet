// CLOUD_TASK_6, finding 2: a decision that defines a structure ("the value
// becomes a map from key to an array") is only usable when its subject terms
// are pinned: what the key is, what the value is, one entry per what. The
// summary is asked for them in `terms`; this is the cheap check in code, no
// model call: it never fills a term in, it only says one is missing.

/**
 * Words that mean the decision shapes data or an interface. Stems, matched at
 * the start of a word, so "ключ" finds "ключом" but not "включить".
 */
const STRUCTURE_WORD =
  /(?<![\p{L}\p{N}])(?:ключ|мап[аыуеоиі]?|маппинг|массив|пол(?:е|я|ей|ям|ями|ях|ю)(?![\p{L}])|таблиц|колонк|колонок|столб(?:ец|ца|цы|цов)|спис(?:ок|ка|ки|ков|ке)|словар|map|list|array|key|field|table|column|dict)/iu;

/** Starts of a `terms` value that say the call left a term open. */
const UNCLEAR = /^\s*(?:не\s+уточнено|not\s+specified|unclear)(?![\p{L}])/iu;

export function mentionsStructure(text: string): boolean {
  return STRUCTURE_WORD.test(text);
}

/**
 * "unclear": the summary (or the analyst) wrote "не уточнено: ...".
 * "missing": an accepted decision about a structure with no terms at all.
 * null: nothing to flag.
 */
export function termsProblem(decision: { text: string; status: string; terms?: string }): "unclear" | "missing" | null {
  const terms = (decision.terms ?? "").trim();
  if (terms && UNCLEAR.test(terms)) return "unclear";
  if (!terms && decision.status === "accepted" && mentionsStructure(decision.text)) return "missing";
  return null;
}
