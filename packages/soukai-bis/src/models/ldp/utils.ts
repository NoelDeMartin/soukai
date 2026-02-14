import { isSubclassOf } from '@noeldemartin/utils';

import Container from './Container';
import { isModelClass } from '../utils';
import type { ContainerConstructor } from '../types';

export function isContainerClass(value: unknown): value is ContainerConstructor {
    return isModelClass(value) && isSubclassOf(value, Container);
}
