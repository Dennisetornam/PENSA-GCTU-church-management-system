// RateLimiter — a Cloudflare Durable Object that stores per-key counters and
// expiration windows. One DO instance is addressed per logical limit key
// (e.g. "login:ip:1.2.3.4"), so counters are strongly consistent (no races).
//
// Uses the RPC style (extends DurableObject): callers invoke `stub.limit(...)`
// directly instead of constructing fetch() requests.

import { DurableObject } from "cloudflare:workers";
import { evaluateWindow, type WindowState } from "./window";

export interface LimitInput {
  /** Unique storage key for this counter (caller-namespaced). */
  key: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface LimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAtMs: number;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

const CLEANUP_GRACE_MS = 60 * 60 * 1000; // keep expired entries 1h before purge

export class RateLimiter extends DurableObject {
  /** Atomically count one hit against `key` and decide if it is allowed. */
  async limit(input: LimitInput): Promise<LimitResult> {
    const now = Date.now();
    const prev = (await this.ctx.storage.get<WindowState>(input.key)) ?? null;
    const decision = evaluateWindow(prev, now, input.limit, input.windowMs);

    await this.ctx.storage.put(input.key, decision.state);
    // Wake up shortly after the latest reset to purge stale counters and free storage.
    await this.ctx.storage.setAlarm(decision.resetAtMs + CLEANUP_GRACE_MS);

    return {
      allowed: decision.allowed,
      limit: decision.limit,
      remaining: decision.remaining,
      resetAtMs: decision.resetAtMs,
      retryAfterSec: decision.retryAfterSec,
    };
  }

  /** Inspect a key without counting a hit (for dashboards/debugging). */
  async peek(key: string): Promise<WindowState | null> {
    return (await this.ctx.storage.get<WindowState>(key)) ?? null;
  }

  /** Storage janitor: delete windows whose reset time has fully elapsed. */
  override async alarm(): Promise<void> {
    const now = Date.now();
    const all = await this.ctx.storage.list<WindowState>();
    for (const [k, v] of all) {
      if (now - v.windowStartMs >= v.windowMs + CLEANUP_GRACE_MS) {
        await this.ctx.storage.delete(k);
      }
    }
  }
}
