import type { SoukaiZodMeta, ContainerSlugOptions, RDFCastOptions } from 'soukai-bis/zod/soukai';
import {
    rdfCast as _rdfCast,
    rdfProperties as _rdfProperties,
    deepMeta as _deepMeta,
    rdfProperty as _rdfProperty,
    useAsContainerSlug as _useAsContainerSlug,
    useAsSlug as _useAsSlug,
} from 'soukai-bis/zod/soukai';
import type { ZodType, output } from 'zod';

export function deepMeta<T extends ZodType, TKey extends keyof SoukaiZodMeta>(
    this: T,
    key: TKey,
): SoukaiZodMeta[TKey] | undefined {
    return _deepMeta(this, key);
}

export function rdfProperty<T extends ZodType>(this: T, value: string): T {
    return _rdfProperty(this, value);
}

export function rdfProperties<T extends ZodType>(this: T): string[] | undefined;
export function rdfProperties<T extends ZodType>(this: T, values: string[]): T;
export function rdfProperties<T extends ZodType>(this: T, values?: string[]): T | string[] | undefined {
    return _rdfProperties(this, values as string[]);
}

export function useAsSlug<T extends ZodType>(this: T): T {
    return _useAsSlug(this);
}

export function useAsContainerSlug<T extends ZodType>(this: T, options?: ContainerSlugOptions): T {
    return _useAsContainerSlug(this, options);
}

export function rdfCast<T extends ZodType>(this: T): RDFCastOptions | undefined;
export function rdfCast<T extends ZodType>(this: T, options: RDFCastOptions<NonNullable<output<T>>>): T;
export function rdfCast<T extends ZodType>(
    this: T,
    options?: RDFCastOptions<NonNullable<output<T>>>,
): T | RDFCastOptions | undefined {
    return options ? _rdfCast(this, options) : _rdfCast(this);
}
