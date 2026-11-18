import type { Quad_Object } from '@rdfjs/types';
import {
    ZodCatch,
    ZodDefault,
    ZodNonOptional,
    ZodNullable,
    ZodOptional,
    ZodPipe,
    ZodPrefault,
    ZodReadonly,
    ZodTransform,
} from 'zod';
import type { ZodType, output } from 'zod';
import type { SomeType } from 'zod/v4/core';

export interface SoukaiZodMeta {
    rdfSlug?: boolean;
    rdfContainerSlug?: ContainerSlugOptions;
    rdfProperties?: string[];
    rdfCast?: RDFCastOptions;
}

// oxlint-disable-next-line typescript/no-explicit-any
export interface RDFCastOptions<T = any> {
    serialize?: (value: T) => unknown;
    deserialize?: (values: unknown[], terms: Quad_Object[]) => unknown;
}

export interface ContainerSlugOptions {
    documentSlug?: string;
}

export function unwrapType(type: SomeType): SomeType | null {
    if (
        type instanceof ZodOptional ||
        type instanceof ZodDefault ||
        type instanceof ZodNullable ||
        type instanceof ZodCatch ||
        type instanceof ZodReadonly ||
        type instanceof ZodPrefault ||
        type instanceof ZodNonOptional
    ) {
        return type.def.innerType;
    }

    if (type instanceof ZodPipe) {
        return type.def.out instanceof ZodTransform ? type.def.in : type.def.out;
    }

    return null;
}

export function deepMeta<T extends keyof SoukaiZodMeta>(type: ZodType, key: T): SoukaiZodMeta[T] | undefined {
    const meta = type.meta();

    if (meta && key in meta) {
        return meta[key];
    }

    const innerType = unwrapType(type);

    return innerType ? deepMeta(innerType as ZodType, key) : undefined;
}

export function rdfCast<T extends ZodType>(type: T): RDFCastOptions | undefined;
export function rdfCast<T extends ZodType>(type: T, options: RDFCastOptions<NonNullable<output<T>>>): T;
export function rdfCast<T extends ZodType>(
    type: T,
    options?: RDFCastOptions<NonNullable<output<T>>>,
): T | RDFCastOptions | undefined {
    if (!options) {
        return deepMeta(type, 'rdfCast');
    }

    return type.meta({ rdfCast: options });
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

export function useAsContainerSlug<T extends ZodType>(type: T, options?: ContainerSlugOptions): T {
    return type.meta({ rdfContainerSlug: { documentSlug: options?.documentSlug ?? 'index' } });
}

declare module 'zod' {
    interface GlobalMeta extends SoukaiZodMeta {}
}
