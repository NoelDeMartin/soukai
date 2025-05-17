import { fail } from '@noeldemartin/utils';
import type { Constructor, Nullable } from '@noeldemartin/utils';
import type { Model } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';

const weakMemos: Record<string, WeakMap<object, unknown>> = {};

export function clearWeakMemo(name: string, key: object): void {
    weakMemos[name]?.delete(key);
}

export function setWeakMemo(name: string, key: object, value: unknown): void {
    const memo = (weakMemos[name] ??= new WeakMap());

    memo.set(key, value);
}

export function getWeakMemo<T>(name: string, key: object): T | null {
    return (weakMemos[name]?.get(key) as T) ?? null;
}

export function weakMemo<T>(name: string, key: object, operation: () => T): T {
    if (!weakMemos[name]?.has(key)) {
        setWeakMemo(name, key, operation());
    }

    return (weakMemos[name]?.get(key) as T) ?? fail();
}

export function bustWeakMemoModelCache(model: Nullable<Model>): void {
    const relatedModels = model && getWeakMemo<SolidModel[]>('related-models', model);
    const documentModels = model && getWeakMemo<SolidModel[]>('document-models', model);

    relatedModels?.forEach((relatedModel) => clearWeakMemo('related-models', relatedModel));
    documentModels?.forEach((documentModel) => clearWeakMemo('document-models', documentModel));
}

export function monkeyPatchPrototype(target: Constructor, method: string, implementation: Function): void {
    target.prototype[method] = implementation;
}
