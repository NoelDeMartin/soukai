import { readFileSync } from 'fs';

import type { Constructor } from '@noeldemartin/utils';
import { defineSolidModelSchema } from 'soukai-solid/models';
import type { SolidMagicAttributes, SolidModel, SolidModelConstructor } from 'soukai-solid/models';
import { expect, vi } from 'vite-plus/test';

export function assertInstanceOf<T>(object: unknown, constructor: Constructor<T>, assert: (instance: T) => void): void {
    expect(object).toBeInstanceOf(constructor);

    assert(object as T);
}

export function loadFixture<T = string>(name: string): T {
    const raw = readFileSync(`${__dirname}/../tests/fixtures/${name}`).toString();

    return /\.json(ld)$/.test(name) ? JSON.parse(raw) : (raw as T);
}

export function solidModelWithTimestamps<T extends SolidModel>(
    model: SolidModelConstructor<T>,
): Constructor<SolidMagicAttributes<{ timestamps: true }>> & SolidModelConstructor<T> {
    return defineSolidModelSchema(model, { timestamps: true });
}

export function solidModelWithHistory<T extends SolidModel>(
    model: SolidModelConstructor<T>,
): Constructor<SolidMagicAttributes<{ timestamps: true; history: true }>> & SolidModelConstructor<T> {
    return defineSolidModelSchema(model, { timestamps: true, history: true });
}

/**
 * Fakes `Date` (but not timers), so that tests relying on timestamps are deterministic. Time only moves when
 * advanced explicitly with `vi.advanceTimersByTime()`, and real time is restored after each test.
 */
export function useFakeClock(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
}
