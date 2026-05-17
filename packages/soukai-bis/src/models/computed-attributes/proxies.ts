import { isInstanceOf, isPlainObject } from '@noeldemartin/utils';

import Model from 'soukai-bis/models/Model';
import UndefinedComputedValue from 'soukai-bis/errors/UndefinedComputedValue';

const proxies = new WeakMap<object, ComputedProxy>();

export const computedProxyMarker: unique symbol = Symbol('computedProxyMarker');
export const computedProxyGetter: unique symbol = Symbol('computedProxyGetter');

export type ComputedProxy<T = object> = { [computedProxyGetter]: T } & (T extends object
    ? Required<{
          [K in keyof T]: NonNullable<ComputedProxy<T[K]>>;
      }>
    : T extends Array<infer TItem>
      ? ComputedProxy<TItem>[]
      : T);

export function isComputedProxy(value: unknown): value is ComputedProxy {
    return typeof value === 'object' && value !== null && computedProxyMarker in value;
}

export function unpackComputedValue<T>(value: T): T {
    if (isComputedProxy(value)) {
        return value[computedProxyGetter] as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => unpackComputedValue(item)) as T;
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, unpackComputedValue(v)])) as T;
    }

    return value;
}

export function computedProxy<T>(target: T): ComputedProxy<T> {
    if (target === undefined) {
        return new Proxy(
            {},
            {
                get(_, property: string | symbol) {
                    if (property === computedProxyGetter) {
                        return undefined;
                    }

                    throw new UndefinedComputedValue();
                },
                has(_, property: string | symbol) {
                    return property === computedProxyMarker;
                },
            },
        ) as ComputedProxy<T>;
    }

    if (!isPlainObject(target) && !Array.isArray(target) && !isInstanceOf(target, Model)) {
        return target as ComputedProxy<T>;
    }

    if (proxies.has(target)) {
        return proxies.get(target) as ComputedProxy<T>;
    }

    return new Proxy(target, {
        get(getTarget: object, property: string | symbol, receiver: unknown) {
            if (property === computedProxyGetter) {
                return target;
            }

            return computedProxy(Reflect.get(getTarget, property, receiver));
        },
        has(hasTarget: object, property: string | symbol) {
            if (property === computedProxyMarker) {
                return true;
            }

            return Reflect.has(hasTarget, property);
        },
    }) as ComputedProxy<T>;
}
