import { describe, it, expect } from "vitest";
import { evaluateWindow, type WindowState } from "../../src/rate-limit/window";

describe("evaluateWindow (fixed-window math)", () => {
  const LIMIT = 3;
  const WIN = 60_000;

  it("allows requests up to the limit, then blocks", () => {
    let state: WindowState | null = null;
    const now = 1_000_000;
    const results = [0, 1, 2, 3].map((i) => {
      const d = evaluateWindow(state, now + i, LIMIT, WIN);
      state = d.state;
      return d.allowed;
    });
    expect(results).toEqual([true, true, true, false]);
  });

  it("reports remaining and retryAfter correctly when blocked", () => {
    let state: WindowState | null = null;
    const start = 5_000_000;
    for (let i = 0; i < LIMIT; i++) state = evaluateWindow(state, start, LIMIT, WIN).state;
    const blocked = evaluateWindow(state, start + 10_000, LIMIT, WIN); // 10s into window
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBe(50); // 60s - 10s
  });

  it("auto-resets after the window expires", () => {
    let state: WindowState | null = null;
    const start = 9_000_000;
    for (let i = 0; i < LIMIT; i++) state = evaluateWindow(state, start, LIMIT, WIN).state;
    const afterExpiry = evaluateWindow(state, start + WIN + 1, LIMIT, WIN);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(LIMIT - 1);
  });
});
