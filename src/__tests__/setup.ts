import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// JSDOM's localStorage caps at 5MB and Zustand persists the seeded demo
// dataset on first import. Replace it with an unbounded in-memory store
// so the store module loads without QuotaExceededError.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), writable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), writable: true });

afterEach(() => {
  cleanup();
  localStorage.clear();
});
