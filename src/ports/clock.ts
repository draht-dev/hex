/**
 * Clock — driven port. The only source of time for the core and its use cases.
 *
 * Implementations:
 * - `ManualClock` (`../adapters`): tests advance time explicitly.
 * - Browser apps: `Date.now()` plus `requestAnimationFrame`/`setInterval` with a fixed-step accumulator.
 * - Server processes: `Date.now()` plus `setInterval`.
 */
export interface Clock {
  /** Current wall/virtual time in epoch milliseconds (used for createdAt, logs). */
  now(): number;

  /**
   * Call `onTick` repeatedly at a fixed `intervalMs` step. Adapters must pass the *fixed* step
   * as `dtMs` (catching up with several calls if they fell behind), so the core stays deterministic.
   * @returns a function that stops the ticking.
   */
  every(intervalMs: number, onTick: (dtMs: number, nowMs: number) => void): () => void;
}
