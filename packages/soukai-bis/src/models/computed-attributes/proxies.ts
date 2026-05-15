import UndefinedComputedValue from 'soukai-bis/errors/UndefinedComputedValue';
import type Model from 'soukai-bis/models/Model';

const proxies = new WeakMap<object, ComputedProxy>();

export type ComputedProxy<T = object> = T extends Model
    ? Required<{
          [K in keyof T]: NonNullable<ComputedProxy<T[K]>>;
      }>
    : T extends Array<infer TItem>
      ? ComputedProxy<TItem>[]
      : T;

export function computedProxy<T>(target: T): ComputedProxy<T> {
    if (typeof target !== 'object' || target === null || target instanceof Date) {
        return target as ComputedProxy<T>;
    }

    if (proxies.has(target)) {
        return proxies.get(target) as ComputedProxy<T>;
    }

    return new Proxy(target, {
        get(getTarget: object, property: string | symbol, receiver: unknown) {
            const value = Reflect.get(getTarget, property, receiver);

            if (value === undefined) {
                throw new UndefinedComputedValue();
            }

            return computedProxy(value);
        },
    }) as ComputedProxy<T>;
}
