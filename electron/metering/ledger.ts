import type { KeyValueStore } from "../platform/kv.js";
import type { UsagePurpose, UsageSummary, UsageTotals } from "../shared/ipc-contract.js";
import { modelWeight } from "./model-weights.js";

/**
 * Local record of every model call: tokens in and out, model, purpose, and
 * whether it ran on the user's own key or on the Avalet budget. Kept in its
 * own store file as running totals (per month, per trial, per meeting) plus
 * the last calls for the Advanced view, so it never grows without bound.
 *
 * For the Avalet budget the server is authoritative (it meters the proxy);
 * this ledger is what the app shows between refreshes and offline.
 */

export type LedgerEntry = {
  at: number;
  providerId: string;
  model: string;
  purpose: UsagePurpose;
  inputTokens: number;
  outputTokens: number;
  /** true when the provider sent no usage and the numbers are a local estimate. */
  estimated: boolean;
  /** "own" = user's key, "avalet" = built-in provider (trial or pro). */
  tier: "own" | "avalet";
  /** Set while the entitlement is a trial: the one-off trial budget is counted separately. */
  trial: boolean;
  meetingId: string | null;
};

type Bucket = UsageTotals & { byPurpose: Partial<Record<UsagePurpose, UsageTotals>> };

export type LedgerState = {
  /** "2026-09" -> own and avalet totals for that calendar month. */
  months: Record<string, { own: Bucket; avalet: Bucket }>;
  /** Weighted tokens spent while on the trial. */
  trial: Bucket;
  /** meeting id -> totals, newest last. */
  meetings: Record<string, UsageTotals>;
  recent: Array<LedgerEntry & { weighted: number }>;
};

const RECENT_LIMIT = 100;
const MEETINGS_LIMIT = 50;

export function emptyTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, weighted: 0, calls: 0, estimatedCalls: 0 };
}

function emptyBucket(): Bucket {
  return { ...emptyTotals(), byPurpose: {} };
}

export function emptyLedger(): LedgerState {
  return { months: {}, trial: emptyBucket(), meetings: {}, recent: [] };
}

export function monthKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function add(totals: UsageTotals, entry: LedgerEntry, weighted: number): UsageTotals {
  return {
    inputTokens: totals.inputTokens + entry.inputTokens,
    outputTokens: totals.outputTokens + entry.outputTokens,
    weighted: totals.weighted + weighted,
    calls: totals.calls + 1,
    estimatedCalls: totals.estimatedCalls + (entry.estimated ? 1 : 0),
  };
}

function addToBucket(bucket: Bucket, entry: LedgerEntry, weighted: number): Bucket {
  const purpose = bucket.byPurpose[entry.purpose] ?? emptyTotals();
  return { ...add(bucket, entry, weighted), byPurpose: { ...bucket.byPurpose, [entry.purpose]: add(purpose, entry, weighted) } };
}

/** Pure: folds one call into the totals. */
export function applyEntry(state: LedgerState, entry: LedgerEntry): LedgerState {
  const weighted = (entry.inputTokens + entry.outputTokens) * modelWeight(entry.model);
  const key = monthKey(entry.at);
  const month = state.months[key] ?? { own: emptyBucket(), avalet: emptyBucket() };
  const nextMonth = { ...month, [entry.tier]: addToBucket(month[entry.tier], entry, weighted) };

  const meetings = { ...state.meetings };
  if (entry.meetingId) {
    const previous = meetings[entry.meetingId] ?? emptyTotals();
    delete meetings[entry.meetingId]; // re-insert as newest
    meetings[entry.meetingId] = add(previous, entry, weighted);
    const ids = Object.keys(meetings);
    for (const id of ids.slice(0, Math.max(0, ids.length - MEETINGS_LIMIT))) delete meetings[id];
  }

  return {
    months: { ...state.months, [key]: nextMonth },
    trial: entry.tier === "avalet" && entry.trial ? addToBucket(state.trial, entry, weighted) : state.trial,
    meetings,
    recent: [...state.recent, { ...entry, weighted }].slice(-RECENT_LIMIT),
  };
}

function totalsOf(bucket: Bucket | undefined): UsageTotals {
  if (!bucket) return emptyTotals();
  const { byPurpose: _ignored, ...totals } = bucket;
  return totals;
}

/** Pure: what the UI shows. */
export function summarize(state: LedgerState, now: number, meetingId: string | null): UsageSummary {
  const month = state.months[monthKey(now)];
  return {
    month: monthKey(now),
    own: totalsOf(month?.own),
    avalet: totalsOf(month?.avalet),
    byPurpose: {
      ...Object.fromEntries(
        (["suggestion", "tracker", "summary", "screenshot"] as UsagePurpose[]).map((p) => [
          p,
          add2(month?.own.byPurpose[p], month?.avalet.byPurpose[p]),
        ]),
      ),
    } as Record<UsagePurpose, UsageTotals>,
    trialWeighted: state.trial.weighted,
    meeting: meetingId ? (state.meetings[meetingId] ?? emptyTotals()) : null,
    recent: state.recent.slice(-20).map((e) => ({
      at: e.at,
      model: e.model,
      purpose: e.purpose,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      weighted: e.weighted,
      estimated: e.estimated,
      tier: e.tier,
    })),
  };
}

function add2(a: UsageTotals | undefined, b: UsageTotals | undefined): UsageTotals {
  const x = a ?? emptyTotals();
  const y = b ?? emptyTotals();
  return {
    inputTokens: x.inputTokens + y.inputTokens,
    outputTokens: x.outputTokens + y.outputTokens,
    weighted: x.weighted + y.weighted,
    calls: x.calls + y.calls,
    estimatedCalls: x.estimatedCalls + y.estimatedCalls,
  };
}

function isLedger(value: unknown): value is LedgerState {
  const v = value as LedgerState | undefined;
  return Boolean(v && typeof v === "object" && v.months && v.trial && v.meetings && Array.isArray(v.recent));
}

/** The ledger as stored in its own electron-store file ("avalet-usage"). */
export class UsageLedger {
  private listeners: Array<() => void> = [];

  constructor(private readonly kv: KeyValueStore) {}

  state(): LedgerState {
    const stored = this.kv.get("ledger");
    return isLedger(stored) ? stored : emptyLedger();
  }

  record(entry: LedgerEntry): void {
    this.kv.set("ledger", applyEntry(this.state(), entry));
    for (const listener of this.listeners) listener();
  }

  summary(now: number, meetingId: string | null): UsageSummary {
    return summarize(this.state(), now, meetingId);
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }
}
