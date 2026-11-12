import { ZodDefault, ZodOptional } from 'zod';
import type { ZodType } from 'zod';

export interface SoukaiZodMeta {
    rdfSlug?: boolean;
    rdfProperties?: string[];
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

export function rdfProperty<T extends ZodType>(type: T, value: string): T {
    return rdfProperties(type, [value]);
}

export function rdfProperties<T extends ZodType>(type: T): string[] | undefined;
export function rdfProperties<T extends ZodType>(type: T, values: string[]): T;
export function rdfProperties<T extends ZodType>(type: T, values?: string[]): T | string[] | undefined {
    if (!values) {
        return deepMeta(type, 'rdfProperties');
    }

    return type.meta({ rdfProperties: values });
}

export function useAsSlug<T extends ZodType>(type: T): T {
    return type.meta({ rdfSlug: true });
}

declare module 'zod' {
    interface GlobalMeta extends SoukaiZodMeta {}
}
