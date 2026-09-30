import type { SoukaiZodMeta } from 'soukai-bis/zod/soukai';
import { deepMeta as _deepMeta, rdfProperty as _rdfProperty, useAsSlug as _useAsSlug } from 'soukai-bis/zod/soukai';
import type { ZodType } from 'zod';

export function deepMeta<T extends ZodType, TKey extends keyof SoukaiZodMeta>(
    this: T,
    key: TKey,
): SoukaiZodMeta[TKey] | undefined {
    return _deepMeta(this, key);
}

export function rdfProperty<T extends ZodType>(this: T): string | undefined;
export function rdfProperty<T extends ZodType>(this: T, value: string): T;
export function rdfProperty<T extends ZodType>(this: T, value?: string): T | string | undefined {
    return _rdfProperty(this, value as string);
}

export function useAsSlug<T extends ZodType>(this: T): T {
    return _useAsSlug(this);
}
