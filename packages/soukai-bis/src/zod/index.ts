// This folder is used to extend Zod's native functionality with Soukai features by patching the prototypes
// of core classes. This may seem like an anti-pattern, but it's actually been recommended by the author of Zod.
//
// See https://github.com/colinhacks/zod/pull/3445#issuecomment-2091463120

import { z } from 'zod';
import * as coreExtensions from './extensions/core';

export type ZodCoreExtensions = typeof coreExtensions;

export function patchZod(): void {
    for (const [method, implementation] of Object.entries(coreExtensions)) {
        z.ZodType.prototype[method] = implementation;
    }
}

declare module 'zod' {
    interface ZodType extends ZodCoreExtensions {}
}
