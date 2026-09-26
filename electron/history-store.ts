import type { KeyValueStore } from "./platform/kv.js";
import type { HistoryBlock } from "./shared/ipc-contract.js";

export type { HistoryBlock };

// Separate store file from settings-store: history can get large and churns
// far more often, no reason to rewrite the settings file on every block.
let kv: KeyValueStore | null = null;

export function initHistoryStore(store: KeyValueStore): void {
  kv = store;
}

function db(): KeyValueStore {
  if (!kv) throw new Error("history store not initialized");
  return kv;
}

const MAX_BLOCKS = 200;

export function getHistory(): HistoryBlock[] {
  const blocks = db().get("blocks");
  return Array.isArray(blocks) ? (blocks as HistoryBlock[]) : [];
}

export function appendHistoryBlock(block: HistoryBlock): void {
  const blocks = getHistory();
  blocks.push(block);
  if (blocks.length > MAX_BLOCKS) blocks.splice(0, blocks.length - MAX_BLOCKS);
  db().set("blocks", blocks);
}

export function clearHistory(): void {
  db().set("blocks", []);
}
