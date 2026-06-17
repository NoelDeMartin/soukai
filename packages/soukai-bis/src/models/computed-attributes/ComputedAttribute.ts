import { isInstanceOf } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import RelationNotLoaded from 'soukai-bis/errors/RelationNotLoaded';
import { getRelatedClasses } from 'soukai-bis/models/relations/utils';
import type Model from 'soukai-bis/models/Model';

import ComputedAttributesCache from './ComputedAttributesCache';

export interface UpdateOptions {
    refresh?: boolean;
    useCache?: boolean;
    loadRelations?: boolean;
}

export type ComputedAttributeCompute<TTarget extends Model = Model, TValue = unknown> = (target: TTarget) => TValue;

export default class ComputedAttribute<TValue = unknown> {

    public static __disableLoadingRelations: boolean = false;

    private name: string;
    private target: Model;
    private compute: ComputedAttributeCompute<Model, TValue>;
    private _value: TValue | undefined;

    public constructor(target: Model, name: string, compute: ComputedAttributeCompute<Model, TValue>) {
        this.name = name;
        this.target = target;
        this.compute = compute;
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

    public async updateValue(options: UpdateOptions = {}): Promise<TValue | undefined> {
        if (!this.target.url) {
            return;
        }

        const refresh = options.refresh ?? false;
        const useCache = options.useCache ?? true;
        const loadRelations = options.loadRelations ?? true;
        const cachedValue = useCache && !refresh && (await this.getCachedValue());

        if (cachedValue) {
            return (this._value = cachedValue);
        }

        try {
            this._value = this.compute(this.target);

            await this.setCachedValue(this._value);

            return this._value;
        } catch (error) {
            if (!isInstanceOf(error, RelationNotLoaded)) {
                throw error;
            }

            if (!ComputedAttribute.__disableLoadingRelations && loadRelations && error.model && error.relation) {
                await error.model.loadRelation(error.relation);

                return this.updateValue(options);
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
