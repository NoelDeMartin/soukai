import { isSubclassOf } from '@noeldemartin/utils';

import type { ContainerConstructor } from '../types';
import { isModelClass } from '../utils';
import Container from './Container';

export function isContainerClass(value: unknown): value is ContainerConstructor {
    return isModelClass(value) && isSubclassOf(value, Container);
}
