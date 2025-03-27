import { expect } from 'vitest';
import { readFileSync } from 'fs';
import type { Constructor } from '@noeldemartin/utils';

export function assertInstanceOf<T>(object: unknown, constructor: Constructor<T>, assert: (instance: T) => void): void {
    expect(object).toBeInstanceOf(constructor);

    assert(object as T);
}

export function loadFixture<T = string>(name: string): T {
    const raw = readFileSync(`${__dirname}/../tests/fixtures/${name}`).toString();

    return /\.json(ld)$/.test(name) ? JSON.parse(raw) : (raw as T);
}
