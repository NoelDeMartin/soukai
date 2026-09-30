import { vi } from 'vite-plus/test';

/**
 * Fakes `Date` (but not timers), so that tests relying on timestamps are deterministic. Time only moves when
 * advanced explicitly with `vi.advanceTimersByTime()`, and real time is restored after each test.
 */
export function useFakeClock(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
}
