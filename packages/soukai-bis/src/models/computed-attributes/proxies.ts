import { isPlainObject } from '@noeldemartin/utils';

import UndefinedComputedValue from 'soukai-bis/errors/UndefinedComputedValue';

const proxies = new WeakMap<object, ComputedProxy>();

export const undefinedComputedMarker: unique symbol = Symbol('undefinedComputedMarker');

export type ComputedProxy<T = object> = T extends object
    ? Required<{
          [K in keyof T]: NonNullable<ComputedProxy<T[K]>>;
      }>
    : T extends Array<infer TItem>
      ? ComputedProxy<TItem>[]
      : T;

export function unpackComputedValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => unpackComputedValue(item)) as T;
    }

    if (isPlainObject(value)) {
        if (undefinedComputedMarker in value) {
            return undefined as T;
        }

        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, unpackComputedValue(v)])) as T;
    }

    return value;
}

export function computedProxy<T>(target: T): ComputedProxy<T> {
    if (target === undefined) {
        return new Proxy(
            {},
            {
                get() {
                    throw new UndefinedComputedValue();
                },
                has(_, property: string | symbol) {
                    return property === undefinedComputedMarker;
                },
            },
        ) as ComputedProxy<T>;
    }

    if (!isPlainObject(target) && !Array.isArray(target)) {
        return target as ComputedProxy<T>;
    }

    if (proxies.has(target)) {
        return proxies.get(target) as ComputedProxy<T>;
    }

    return new Proxy(target, {
        get(getTarget: object, property: string | symbol, receiver: unknown) {
            const value = Reflect.get(getTarget, property, receiver);

            return computedProxy(value);
        },
    }) as ComputedProxy<T>;
}
