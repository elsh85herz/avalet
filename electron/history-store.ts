import Store from "electron-store";

export type HistoryBlock = {
  id: string;
  text: string;
  status: "done" | "error";
  createdAt: number;
};

type StoreShape = {
  blocks: HistoryBlock[];
};

// Separate store file from settings-store — history can get large and churns
// far more often, no reason to rewrite the settings file on every block.
const store = new Store<StoreShape>({ name: "avalet-history", defaults: { blocks: [] } });

const MAX_BLOCKS = 200;

export function getHistory(): HistoryBlock[] {
  return store.get("blocks") ?? [];
}

export function appendHistoryBlock(block: HistoryBlock): void {
  const blocks = getHistory();
  blocks.push(block);
  if (blocks.length > MAX_BLOCKS) blocks.splice(0, blocks.length - MAX_BLOCKS);
  store.set("blocks", blocks);
}

export function clearHistory(): void {
  store.set("blocks", []);
}
