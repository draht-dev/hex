/**
 * ManualClock: time only moves when you call `advance(ms)`. Tests use it to make time-dependent
 * use cases fully deterministic. Tickers fire in registration order, once per elapsed
 * interval (a 120 ms advance on a 50 ms ticker fires twice and carries 20 ms over).
 */
import type { Clock } from '../../ports/clock';

interface Ticker { readonly intervalMs: number; readonly onTick: (dtMs: number, nowMs: number) => void; acc: number; active: boolean }

export class ManualClock implements Clock {
  private t: number;
  private tickers: Ticker[] = [];

  constructor(startMs = 0) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  every(intervalMs: number, onTick: (dtMs: number, nowMs: number) => void): () => void {
    if (!(intervalMs > 0)) throw new Error('ManualClock.every: intervalMs must be > 0');
    const tk: Ticker = { intervalMs, onTick, acc: 0, active: true };
    this.tickers.push(tk);
    return () => {
      tk.active = false;
      this.tickers = this.tickers.filter((x) => x !== tk);
    };
  }

  /** Move time forward, firing due tickers in order. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('ManualClock.advance: negative');
    let remaining = ms;
    // Walk in steps of the smallest interval so multiple tickers interleave correctly.
    while (remaining > 0) {
      const step = Math.min(remaining, ...this.tickers.map((x) => x.intervalMs - x.acc), remaining);
      this.t += step;
      remaining -= step;
      for (const tk of [...this.tickers]) {
        if (!tk.active) continue;
        tk.acc += step;
        if (tk.acc >= tk.intervalMs) {
          tk.acc -= tk.intervalMs;
          tk.onTick(tk.intervalMs, this.t);
        }
      }
    }
  }

  /** Active ticker count (tests assert start/stop). */
  get activeTickers(): number {
    return this.tickers.length;
  }
}
