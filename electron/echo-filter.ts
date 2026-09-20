// When the other side speaks through the laptop speakers, the microphone hears
// it too, and the same words get transcribed twice: once from the clean
// system-audio channel ("other") and once from the mic ("me"). The clean copy
// wins. A mic segment is dropped when what it says is (almost) contained in
// what the other side said while it was being said; because the two channels
// are cut and transcribed independently, a mic segment is held briefly so a
// later "other" segment of the same speech can still cancel it. Comparing
// text rather than silencing the mic keeps real interruptions, when both
// people talk at once.

/** Speech intervals this close (or overlapping) count as the same moment. */
const OVERLAP_TOLERANCE_MS = 1_500;
/** How long a mic segment waits for a matching "other" segment (transcription queue included). */
const DEFAULT_HOLD_MS = 7_000;
const KEEP_MS = 30_000;
const MIN_CHARS = 12;
const TRIGRAM_THRESHOLD = 0.7;
const WORD_THRESHOLD = 0.6;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const padded = ` ${text} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** True when the mic text is mostly made of what the other side just said. */
export function looksLikeEcho(micText: string, otherTexts: string[]): boolean {
  const mic = normalize(micText);
  if (mic.length < MIN_CHARS || otherTexts.length === 0) return false;
  const other = normalize(otherTexts.join(" "));

  const reference = trigrams(other);
  const grams = trigrams(mic);
  let hits = 0;
  for (const gram of grams) if (reference.has(gram)) hits++;
  if (hits / grams.size < TRIGRAM_THRESHOLD) return false;

  const otherWords = new Set(other.split(" ").filter((w) => w.length >= 3));
  const micWords = mic.split(" ").filter((w) => w.length >= 3);
  if (micWords.length === 0) return false;
  return micWords.filter((w) => otherWords.has(w)).length / micWords.length >= WORD_THRESHOLD;
}

/** `start` and `end` are wall-clock ms of when the words were spoken. */
type Entry = { start: number; end: number; text: string };
type Held = Entry & { commit: () => void; timer: ReturnType<typeof setTimeout> };

export class EchoFilter {
  private others: Entry[] = [];
  private held: Held[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    private readonly onDrop: (text: string) => void = () => {},
    private readonly holdMs: number = DEFAULT_HOLD_MS,
  ) {}

  private overlapping(entry: Entry): string[] {
    return this.others
      .filter((o) => o.start <= entry.end + OVERLAP_TOLERANCE_MS && entry.start <= o.end + OVERLAP_TOLERANCE_MS)
      .map((o) => o.text);
  }

  /** Records what the other side said and cancels any held mic segment that merely repeats it. */
  pushOther(entry: Entry): void {
    this.others.push(entry);
    this.others = this.others.filter((o) => this.now() - o.end <= KEEP_MS);
    this.held = this.held.filter((h) => {
      if (!looksLikeEcho(h.text, this.overlapping(h))) return true;
      clearTimeout(h.timer);
      this.onDrop(h.text);
      return false;
    });
  }

  /** Commits the mic segment unless it echoes the other side; waits a little first in case it is about to. */
  pushMe(entry: Entry, commit: () => void): void {
    if (looksLikeEcho(entry.text, this.overlapping(entry))) {
      this.onDrop(entry.text);
      return;
    }
    const held: Held = {
      ...entry,
      commit,
      timer: setTimeout(() => {
        this.held = this.held.filter((h) => h !== held);
        commit();
      }, this.holdMs),
    };
    this.held.push(held);
  }

  /** Commits everything still waiting (the session was stopped). */
  flush(): void {
    const pending = this.held;
    this.held = [];
    for (const h of pending) {
      clearTimeout(h.timer);
      h.commit();
    }
  }

  reset(): void {
    for (const h of this.held) clearTimeout(h.timer);
    this.held = [];
    this.others = [];
  }
}
