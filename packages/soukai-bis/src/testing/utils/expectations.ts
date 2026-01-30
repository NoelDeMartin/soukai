import { deepEquals } from '@noeldemartin/utils';
import { expect } from 'vitest';

import type Operation from 'soukai-bis/models/crdts/Operation';

export function expectOperations(actual: unknown, expected: Operation[]): void {
    expect(actual).toHaveLength(expected.length);

    for (const expectedOperation of expected) {
        expect(
            (actual as Operation[]).some((actualOperation) => {
                return (
                    actualOperation instanceof expectedOperation.static() &&
                    deepEquals(actualOperation.getAttributes(), expectedOperation.getAttributes())
                );
            }),
            `Operation not found: ${JSON.stringify(expectedOperation.getAttributes())}`,
        ).toBe(true);
    }
}
