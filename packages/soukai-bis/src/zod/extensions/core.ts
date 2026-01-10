import { ZodDefault, ZodOptional } from 'zod';
import type { ZodType } from 'zod';

function getDeepMeta<T extends keyof CustomMeta>(type: ZodType, key: T): CustomMeta[T] | undefined {
    const meta = type.meta();

    if (meta && key in meta) {
        return meta[key];
    }

    if (type instanceof ZodDefault) {
        return getDeepMeta(type.def.innerType as ZodType, key);
    }

    if (type instanceof ZodOptional) {
        return getDeepMeta(type.def.innerType as ZodType, key);
    }

    return undefined;
}

export interface CustomMeta {
    rdfProperty?: string;
}

export function rdfProperty<T extends ZodType>(this: T): string | undefined;
export function rdfProperty<T extends ZodType>(this: T, value: string): T;
export function rdfProperty<T extends ZodType>(this: T, value?: string): T | string | undefined {
    if (typeof value !== 'string') {
        return getDeepMeta(this, 'rdfProperty');
    }

    return this.meta({ rdfProperty: value });
}

declare module 'zod' {
    interface GlobalMeta extends CustomMeta {}
}
