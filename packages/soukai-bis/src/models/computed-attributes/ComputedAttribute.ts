import { Semaphore, isInstanceOf } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import RelationNotLoaded from 'soukai-bis/errors/RelationNotLoaded';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import ComputedAttributesCache from './ComputedAttributesCache';
import { getComputedAttributeRelations } from './registry';
import type { RelationTree } from './registry';

const relationsLock = new Semaphore(20);

export const InvalidationStrategies = {
    DOCUMENT: 'document',
    CONTAINER: 'container',
} as const;

export interface UpdateOptions {
    refresh?: boolean;
    useCache?: boolean;
    loadRelations?: boolean;
}

export type InvalidationStrategy = (typeof InvalidationStrategies)[keyof typeof InvalidationStrategies];
export type ComputedAttributeListener<TValue = unknown> = (value: TValue | undefined) => unknown;
export type ComputedAttributeCompute<TTarget extends Model = Model, TValue = unknown> = (target: TTarget) => TValue;

export default class ComputedAttribute<TValue = unknown> {

    private static relationsDisabled: boolean = false;
    private static refreshesDisabled: boolean = false;

    public static disableLoadingRelations(): void {
        this.relationsDisabled = true;
    }

    public static enableLoadingRelations(): void {
        this.relationsDisabled = false;
    }

    public static disableRefreshes(): void {
        this.refreshesDisabled = true;
    }

    public static enableRefreshes(): void {
        this.refreshesDisabled = false;
    }

    public readonly invalidationStrategy: InvalidationStrategy;
    private name: string;
    private target: Model;
    private compute: ComputedAttributeCompute<Model, TValue>;
    private _value: TValue | undefined;
    private listeners: Set<ComputedAttributeListener<TValue>>;

    public constructor(
        target: Model,
        name: string,
        compute: ComputedAttributeCompute<Model, TValue>,
        invalidationStrategy: InvalidationStrategy,
    ) {
        this.name = name;
        this.target = target;
        this.compute = compute;
        this.invalidationStrategy = invalidationStrategy;
        this.listeners = new Set();
    }

    public get value(): TValue | undefined {
        return this._value;
    }

    public subscribe(listener: ComputedAttributeListener<TValue>): () => void {
        this.listeners.add(listener);

        this.updateValue().then(listener);

        return () => this.listeners.delete(listener);
    }

    public async updateValue(options: UpdateOptions = {}): Promise<TValue | undefined> {
        const loadedRelations: { model: Model; relation: string }[] = [];

        try {
            const previousValue = this._value;
            const updatedValue = await this.runUpdateValue(options, loadedRelations);

            if (previousValue !== updatedValue) {
                this.listeners.forEach((listener) => listener(updatedValue));
            }

            return updatedValue;
        } finally {
            loadedRelations.forEach(({ model, relation }) => model.getRelation(relation).unload());
        }
    }

    private async runUpdateValue(
        options: UpdateOptions,
        loadedRelations: { model: Model; relation: string }[],
    ): Promise<TValue | undefined> {
        if (!this.target.url) {
            return;
        }

        const refresh = !ComputedAttribute.refreshesDisabled && (options.refresh ?? false);
        const useCache = options.useCache ?? true;
        const loadRelations = !ComputedAttribute.relationsDisabled && (options.loadRelations ?? true);
        const cachedValue = useCache && !refresh && (await this.getCachedValue());

        if (cachedValue) {
            return (this._value = cachedValue);
        }

        if (loadRelations && loadedRelations.length === 0) {
            const tree = getComputedAttributeRelations(this.target.static() as ModelConstructor, this.name);

            await this.loadRelationTree([this.target], tree, loadedRelations);
        }

        try {
            this._value = this.compute(this.target);

            await this.setCachedValue(this._value);

            return this._value;
        } catch (error) {
            if (!isInstanceOf(error, RelationNotLoaded)) {
                throw error;
            }

            if (loadRelations && error.model && error.relation) {
                await this.loadRelation(error.model, error.relation, loadedRelations);

                return this.runUpdateValue(options, loadedRelations);
            }

            return (this._value = useCache ? await this.getCachedValue() : undefined);
        }
    }

    private async loadRelation(
        model: Model,
        relation: string,
        loadedRelations: { model: Model; relation: string }[],
    ): Promise<void> {
        loadedRelations.push({ model, relation });

        await relationsLock.run(() => model.loadRelation(relation));
    }

    private async loadRelationTree(
        models: Model[],
        tree: RelationTree,
        loadedRelations: { model: Model; relation: string }[],
    ): Promise<void> {
        if (models.length === 0) {
            return;
        }

        await Promise.all(
            Object.entries(tree).map(async ([relationName, children]) => {
                await Promise.all(
                    models.map(async (model) => {
                        if (model.isRelationLoaded(relationName)) {
                            return;
                        }

                        await this.loadRelation(model, relationName, loadedRelations);
                    }),
                );

                if (Object.keys(children).length > 0) {
                    const nextModels = models.flatMap((model) => model.getRelation(relationName).getLoadedModels());

                    await this.loadRelationTree(nextModels, children, loadedRelations);
                }
            }),
        );
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
