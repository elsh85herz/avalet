// The document under review in the `review` meeting mode ("artifact"): the
// specification the call is about. Pure helpers shared by the main process and
// the renderer: size limits, the rough token figures shown before a spend, and
// the section index that live suggestions get instead of the full text.
// No Electron, no Node.

/** Longest document accepted, in characters (CLOUD_TASK_5, docs/dev/spec-sync-plan.md). */
export const ARTIFACT_CHAR_CAP = 200_000;
/** Above this the cost note is highlighted. */
export const ARTIFACT_HIGHLIGHT_CHARS = 60_000;
/**
 * Rough characters per token for every estimate shown to the user. Russian
 * text runs about 2.5-4 characters per token on current tokenizers.
 */
export const CHARS_PER_TOKEN = 3;
/** The live index never grows past this, however big the document is. */
export const ARTIFACT_INDEX_CHAR_CAP = 4_000;
/** One section added to a typed question that names it. */
export const ARTIFACT_SECTION_CHAR_CAP = 4_000;
const FIRST_LINE_CAP = 100;
const OPEN_QUESTIONS_CAP = 1_500;
/** Written when a decision does not say (or the call did not say) which section it is about. */
export const SECTION_UNKNOWN = "не определён";

export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / CHARS_PER_TOKEN);
}

/** A figure people read as "about": two significant digits (1 460 is 1 500, 23 456 is 23 000). */
export function roundTokens(tokens: number): number {
  if (tokens <= 0) return 0;
  if (tokens < 100) return Math.max(10, Math.round(tokens / 10) * 10);
  const step = 10 ** (Math.floor(Math.log10(tokens)) - 1);
  return Math.round(tokens / step) * step;
}

export type ArtifactSection = {
  /** "3.2": the document's own number when the heading has one, else counted. */
  number: string;
  title: string;
  level: number;
  /** Offsets in the text with "\n" line ends: heading line start, end of the section (next heading of the same or a higher level). */
  start: number;
  end: number;
  /** First non-empty line of the section body. */
  firstLine: string;
};

/** "3.2 Title": what a decision stores in `section` and the section select shows. */
export function sectionLabel(section: ArtifactSection): string {
  return `${section.number} ${section.title}`.trim();
}

const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
// Plain-text documents without markdown headings: "3.2 Лимиты" / "3. Методы" at a line start.
const NUMBERED = /^(\d+(?:\.\d+)*)\.?\s+(\S.{0,118})$/;
const OWN_NUMBER = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/;

export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Headings of the document with their numbers, in order. */
export function parseSections(raw: string): ArtifactSection[] {
  const text = normalizeEol(raw);
  const lines = text.split("\n");
  type Found = { level: number; title: string; offset: number; line: number };
  const atx: Found[] = [];
  const numbered: Found[] = [];
  let offset = 0;
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const h = line.match(ATX);
      if (h) atx.push({ level: h[1]!.length, title: h[2]!.trim(), offset, line: i });
      const n = line.match(NUMBERED);
      if (n && /^[\p{Lu}]/u.test(n[2]!)) numbered.push({ level: n[1]!.split(".").length, title: line.trim(), offset, line: i });
    }
    offset += line.length + 1;
  });
  const found = atx.length > 0 ? atx : numbered;
  if (found.length === 0) return [];
  // One top heading over everything else is the document's title, not section 1.
  const top = Math.min(...found.map((f) => f.level));
  const hasTitle = found.length > 1 && found[0]!.level === top && found.filter((f) => f.level === top).length === 1;
  const minLevel = hasTitle ? Math.min(...found.slice(1).map((f) => f.level)) : top;
  const counters: number[] = [];
  const sections: ArtifactSection[] = found.map((f, index) => {
    if (hasTitle && index === 0) {
      return { number: "", title: f.title, level: 1, start: f.offset, end: text.length, firstLine: "" };
    }
    const depth = f.level - minLevel;
    counters.length = depth + 1;
    for (let d = 0; d <= depth; d++) counters[d] = counters[d] ?? 0;
    counters[depth]! += 1;
    const own = f.title.match(OWN_NUMBER);
    const number = own ? own[1]! : counters.slice(0, depth + 1).map((c) => c || 1).join(".");
    const title = own ? own[2]!.trim() : f.title;
    let end = text.length;
    for (let j = index + 1; j < found.length; j++) {
      if (found[j]!.level <= f.level) {
        end = found[j]!.offset;
        break;
      }
    }
    const bodyEnd = index + 1 < found.length ? found[index + 1]!.line : lines.length;
    let firstLine = "";
    for (let l = f.line + 1; l < bodyEnd; l++) {
      const candidate = lines[l]!.trim();
      if (candidate && !/^(```|~~~)/.test(candidate)) {
        firstLine = candidate;
        break;
      }
    }
    if (firstLine.length > FIRST_LINE_CAP) firstLine = `${firstLine.slice(0, FIRST_LINE_CAP).trimEnd()}…`;
    return { number, title, level: depth + 1, start: f.offset, end, firstLine };
  });
  return sections;
}

const OPEN_QUESTIONS = /открытые вопросы|open questions/i;

/**
 * What live suggestions get of the document: headings with numbers and first
 * lines, plus an "open questions" section word for word. Bounded, so a big
 * document costs every live call the same small amount.
 */
export function buildArtifactIndex(raw: string, cap = ARTIFACT_INDEX_CHAR_CAP): string {
  const text = normalizeEol(raw);
  const sections = parseSections(text);
  const lines = sections.map((s) => `${"  ".repeat(s.level - 1)}${sectionLabel(s)}${s.firstLine ? `: ${s.firstLine}` : ""}`);
  let index = lines.join("\n");
  const open = sections.find((s) => OPEN_QUESTIONS.test(s.title));
  let openBlock = "";
  if (open) {
    let body = text.slice(open.start, open.end).trim();
    if (body.length > OPEN_QUESTIONS_CAP) body = `${body.slice(0, OPEN_QUESTIONS_CAP).trimEnd()}\n[...]`;
    openBlock = `\n\nOpen questions section, verbatim:\n${body}`;
  }
  if (!index) index = "[The document has no headings.]";
  const room = cap - openBlock.length;
  if (index.length > room) index = `${index.slice(0, Math.max(0, room - 40)).trimEnd()}\n[index shortened]`;
  return `${index}${openBlock}`;
}

/** The section a free-text reference points at: "3.2", "раздел 3.2", "3.2 Лимиты", or a heading. */
export function findSection(sections: ArtifactSection[], reference: string): ArtifactSection | null {
  const ref = reference.trim();
  if (!ref || ref.toLowerCase() === SECTION_UNKNOWN) return null;
  const number = ref.match(/(\d+(?:\.\d+)*)/)?.[1];
  if (number) {
    const byNumber = sections.find((s) => s.number === number);
    if (byNumber) return byNumber;
  }
  const lower = ref.toLowerCase().replace(/^(раздел|section|пункт|п\.)\s*/i, "");
  return (
    sections.find((s) => s.title.toLowerCase() === lower) ??
    sections.find((s) => lower.length >= 4 && (s.title.toLowerCase().includes(lower) || lower.includes(s.title.toLowerCase()))) ??
    null
  );
}

/** A section reference in a typed question ("что в разделе 3.2?"), or null. */
export function sectionAskedFor(question: string): string | null {
  const m = question.match(/(?:раздел\p{L}*|пункт\p{L}*|(?<!\p{L})п\.|section|sec\.)\s*(\d+(?:\.\d+)*)/iu);
  return m ? m[1]! : null;
}

/** The text of one section (with its subsections), cut to the cap. */
export function sectionText(raw: string, section: ArtifactSection, cap = ARTIFACT_SECTION_CHAR_CAP): string {
  const body = normalizeEol(raw).slice(section.start, section.end).trim();
  return body.length > cap ? `${body.slice(0, cap).trimEnd()}\n[section shortened]` : body;
}

/**
 * Upper bounds of what the prompts add around the document (instructions,
 * section list, tags), for the estimates; tests keep them honest against the
 * real prompt builders.
 */
export const SUMMARY_ARTIFACT_OVERHEAD_CHARS = 3_000;
/** Allowance for the decisions list in the summary's answer. */
export const SUMMARY_DECISIONS_REPLY_CHARS = 3_000;
/**
 * Review summaries with or without a document (CLOUD_TASK_6): the rules on
 * unanswered questions, terms, contradictions and participants in the
 * prompt, and the longer risks section plus the participants list in the answer.
 */
export const SUMMARY_REVIEW_RULES_CHARS = 3_600;
export const SUMMARY_REVIEW_REPLY_CHARS = 900;
export const PATCH_PROMPT_OVERHEAD_CHARS = 3_500;
/** Wrapper text around the index in a live call. */
export const LIVE_INDEX_OVERHEAD_CHARS = 250;

/** What the update call is told about each checked decision, with short ids ("d1", ...) the model copies back. */
export type PatchDecision = { id: string; text: string; status: string; section: string; before: string; after: string; terms?: string };

export function patchDecisions(
  decisions: Array<{ text: string; status: string; section: string; before: string; after: string; terms?: string }>,
): PatchDecision[] {
  return decisions.map((d, i) => ({
    id: `d${i + 1}`,
    text: d.text,
    status: d.status,
    section: d.section,
    before: d.before,
    after: d.after,
    ...(d.terms?.trim() ? { terms: d.terms.trim() } : {}),
  }));
}

/** Rough size of the model's answer: an anchor and the new text per decision, plus JSON around them. */
export function expectedReplyChars(decisions: Array<{ text: string; before: string; after: string }>): number {
  return decisions.reduce((sum, d) => sum + Math.min(d.before.length || 150, 600) + (d.after.length || d.text.length * 2) + 120, 60);
}
