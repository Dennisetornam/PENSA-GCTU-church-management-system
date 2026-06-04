// Pure fixed-window rate-limit math — no runtime dependencies, fully unit-testable.
// A counter resets automatically once the window elapses (the next request after
// expiry starts a fresh window). Kept separate from the Durable Object so the
// core logic can be tested in plain Node without Workers infrastructure.

export interface WindowState {
  /** Number of requests counted in the current window. */
  count: number;
  /** Epoch ms when the current window started. */
  windowStartMs: number;
  /** Window length in ms (stored so the DO can expire/clean entries). */
  windowMs: number;
}

export interface WindowDecision {
  state: WindowState;
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

/**
 * Evaluate a request against a fixed window.
 * @param prev    previously stored state (or null on first hit)
 * @param nowMs   current epoch ms
 * @param limit   max requests allowed per window
 * @param windowMs window length in ms
 */
export function evaluateWindow(
  prev: WindowState | null,
  nowMs: number,
  limit: number,
  windowMs: number,
): WindowDecision {
  const expired = !prev || nowMs - prev.windowStartMs >= windowMs;
  const state: WindowState = expired
    ? { count: 0, windowStartMs: nowMs, windowMs }
    : { count: prev!.count, windowStartMs: prev!.windowStartMs, windowMs };

  const allowed = state.count < limit;
  if (allowed) state.count += 1;

  const resetAtMs = state.windowStartMs + windowMs;
  const remaining = Math.max(0, limit - state.count);
  const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

  return { state, allowed, limit, remaining, resetAtMs, retryAfterSec };
}
