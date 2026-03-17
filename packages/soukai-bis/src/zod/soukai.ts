import { ZodDefault, ZodOptional } from 'zod';
import type { ZodType } from 'zod';

export interface SoukaiZodMeta {
    rdfSlug?: boolean;
    rdfProperty?: string;
}

export function deepMeta<T extends keyof SoukaiZodMeta>(type: ZodType, key: T): SoukaiZodMeta[T] | undefined {
    const meta = type.meta();

    if (meta && key in meta) {
        return meta[key];
    }

    if (type instanceof ZodDefault) {
        return deepMeta(type.def.innerType as ZodType, key);
    }

    if (type instanceof ZodOptional) {
        return deepMeta(type.def.innerType as ZodType, key);
    }

    return undefined;
}

export function rdfProperty<T extends ZodType>(type: T): string | undefined;
export function rdfProperty<T extends ZodType>(type: T, value: string): T;
export function rdfProperty<T extends ZodType>(type: T, value?: string): T | string | undefined {
    if (typeof value !== 'string') {
        return deepMeta(type, 'rdfProperty');
    }

    return type.meta({ rdfProperty: value });
}

export function useAsSlug<T extends ZodType>(type: T): T {
    return type.meta({ rdfSlug: true });
}

declare module 'zod' {
    interface GlobalMeta extends SoukaiZodMeta {}
}
