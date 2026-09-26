import type { AvaletApi } from "../../../electron/shared/ipc-contract.js";

// The API shape is defined once in electron/shared/ipc-contract.ts and
// implemented by electron/preload.cts; nothing is redeclared here.
type AvaletBridge = AvaletApi;

declare global {
  interface Window {
    avalet?: AvaletBridge;
  }
}

export function getBridge(): AvaletBridge {
  const bridge = window.avalet;
  if (!bridge) throw new Error("Avalet bridge unavailable: preload.cjs did not load");
  return bridge;
}

export type { AvaletBridge };
