/**
 * The few key-value operations the stores need. In the app this is an
 * electron-store instance (see main.ts); tests use MemoryKV. Keeping the stores
 * free of any Electron import is what lets them run under plain `node --test`.
 */
export interface KeyValueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  /** Whole document, for migrations. */
  readonly store: Record<string, unknown>;
}

export class MemoryKV implements KeyValueStore {
  private data: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.data = structuredClone(initial);
  }

  get(key: string): unknown {
    const value = this.data[key];
    return value === undefined ? undefined : structuredClone(value);
  }

  set(key: string, value: unknown): void {
    this.data[key] = structuredClone(value);
  }

  delete(key: string): void {
    delete this.data[key];
  }

  get store(): Record<string, unknown> {
    return structuredClone(this.data);
  }
}

/** Same shape as Electron's safeStorage, so main.ts passes safeStorage itself. */
export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** Test double: "encrypts" by reversing and marking, never used in the app. */
export const fakeSecretBox: SecretBox = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join("")}`, "utf8"),
  decryptString: (encrypted) => {
    const text = encrypted.toString("utf8");
    if (!text.startsWith("enc:")) throw new Error("not encrypted by fakeSecretBox");
    return [...text.slice(4)].reverse().join("");
  },
};
