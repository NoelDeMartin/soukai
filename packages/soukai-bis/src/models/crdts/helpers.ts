import { arraySorted } from '@noeldemartin/utils';

import type Operation from 'soukai-bis/models/crdts/Operation';

export function sortedOperations<T extends Operation>(operations: T[]): T[] {
    return arraySorted(operations as Operation[], 'date') as T[];
}
