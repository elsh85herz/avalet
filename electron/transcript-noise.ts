// Best-effort blocklist of lines the speech recognizer invents in silent
// stretches (CLOUD_TASK_6, finding 5). Whisper-family models were trained on
// subtitled video, so on near-silence they sometimes "hear" the credits:
// "subtitles by ...", "subtitle editor ...", "proofreader ...". This list is
// deliberately short and matched against the WHOLE text of a segment only; a
// sentence that merely mentions subtitles is never touched. It cannot be
// complete and does not try to be: a missed line stays in the transcript, a
// matched one is kept in the record, marked, and shown on request.
// Patterns, not strings: no real names or handles are listed here. Word ends
// are written as (?![\p{L}\p{N}]) because \b does not see Cyrillic letters.

const CREDIT_LINES: RegExp[] = [
  // "Субтитры сделал/создавал/подготовил ...", "Субтитры: ..."
  /^субтитры\s*(?::|сделал[аи]?|создавал[аи]?|создал[аи]?|подготовил[аи]?|подготовлены|делал[аи]?|предоставил[аи]?|by)(?![\p{L}\p{N}])/iu,
  // "Редактор субтитров ...", "Редактор субтитров А. Фамилия Корректор Б. Фамилия"
  /^редактор\s+субтитров(?![\p{L}\p{N}])/iu,
  // "Корректор А.Фамилия", "Редактор Б. Фамилия": the role word, then a capitalised name.
  /^(?:[Кк]орректор|[Рр]едактор)\s+\p{Lu}\.?\s*\p{Lu}[\p{L}-]+(?:\s+(?:[Кк]орректор|[Рр]едактор)\s+\p{Lu}\.?\s*\p{Lu}[\p{L}-]+)?[.!]?$/u,
  /^(?:subtitles?|captions?)\s+(?:by|created\s+by|made\s+by|provided\s+by)(?![\p{L}\p{N}])/iu,
  /^(?:subtitle|caption)s?\s+(?:editor|editing)(?![\p{L}\p{N}])/iu,
  /^(?:[Pp]roofreader|[Pp]roofread\s+by|[Ee]dited\s+by|[Tt]ranslated\s+by)\s+\p{Lu}/u,
];

/** Longer than this is real speech, whatever it starts with. */
const MAX_CREDIT_CHARS = 120;

/** True when the whole segment reads like an invented credit line. */
export function isCreditLine(text: string): boolean {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line || line.length > MAX_CREDIT_CHARS) return false;
  const bare = line.replace(/^[\s"«'([-]+|[\s"»')\]]+$/gu, "");
  return CREDIT_LINES.some((pattern) => pattern.test(bare));
}
