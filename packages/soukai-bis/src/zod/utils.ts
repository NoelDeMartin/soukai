import { ZodDefault, ZodOptional } from 'zod';
import type { SomeType } from 'zod/v4/core';

export function getFinalType(type: SomeType): SomeType {
    if (type instanceof ZodOptional) {
        return getFinalType(type.def.innerType);
    }

    if (type instanceof ZodDefault) {
        return getFinalType(type.def.innerType);
    }

    return type;
}
