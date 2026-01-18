import { isSubclassOf } from '@noeldemartin/utils';

import SolidContainer from './SolidContainer';
import { isModelClass } from './utils';
import type { SolidContainerConstructor } from './types';

export function isSolidContainerClass(value: unknown): value is SolidContainerConstructor {
    return isModelClass(value) && isSubclassOf(value, SolidContainer);
}
