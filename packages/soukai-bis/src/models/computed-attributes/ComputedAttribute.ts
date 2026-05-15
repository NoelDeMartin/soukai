import { isInstanceOf } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import UndefinedComputedValue from 'soukai-bis/errors/UndefinedComputedValue';
import { getRelatedClasses } from 'soukai-bis/models/relations/utils';
import type Model from 'soukai-bis/models/Model';

import ComputedAttributesCache from './ComputedAttributesCache';
import { computedProxy } from './proxies';
import type { ComputedProxy } from './proxies';

export type ComputedAttributeCompute<TTarget extends Model, TValue> = (target: ComputedProxy<TTarget>) => TValue;

export default class ComputedAttribute<TValue = unknown> {

    private name: string;
    private target: Model;
    private compute: ComputedAttributeCompute<Model, TValue>;
    private _value: TValue | undefined;

    public constructor(target: Model, name: string, compute: ComputedAttributeCompute<Model, TValue>) {
        this.name = name;
        this.target = target;
        this.compute = compute;

        this.updateValue({ refresh: false, useCache: true });
    }

    public get value(): TValue | undefined {
        return this._value;
    }

    public subscribe(listener: (value: TValue | undefined) => unknown): () => void {
        const update = async () => {
            const previousValue = this._value;
            const updatedValue = await this.updateValue({ refresh: true, useCache: true });

            if (previousValue !== updatedValue) {
                listener(updatedValue);
            }
        };

        const modelClasses = getRelatedClasses(this.target.static());
        const unsubscribes = modelClasses.flatMap((modelClass) => [
            modelClass.on('saved', () => update()),
            modelClass.on('deleted', () => update()),
            modelClass.on('relation-loaded', () => update()),
        ]);

        update();

        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    }

    public async updateValue(options: { refresh?: boolean; useCache?: boolean } = {}): Promise<TValue | undefined> {
        if (!this.target.url) {
            return;
        }

        const refresh = options.refresh ?? false;
        const useCache = options.useCache ?? true;
        const cachedValue = useCache && !refresh && (await this.getCachedValue());

        if (cachedValue) {
            return (this._value = cachedValue);
        }

        try {
            this._value = this.compute(computedProxy(this.target));

            await this.setCachedValue(this._value);

            return this._value;
        } catch (error) {
            if (!isInstanceOf(error, UndefinedComputedValue)) {
                throw error;
            }

            return (this._value = useCache ? await this.getCachedValue() : undefined);
        }
    }

    private async setCachedValue(value: TValue): Promise<void> {
        if (!this.target.hasUrl()) {
            throw new SoukaiError('Cannot set cached value for model without URL');
        }

        await ComputedAttributesCache.set(this.target, this.name, value);
    }

    private async getCachedValue(): Promise<TValue | undefined> {
        if (!this.target.hasUrl()) {
            throw new SoukaiError('Cannot get cached value for model without URL');
        }

        return ComputedAttributesCache.get(this.target, this.name);
    }

}
