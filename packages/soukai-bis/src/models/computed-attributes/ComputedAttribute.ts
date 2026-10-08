import { Semaphore, isInstanceOf } from '@noeldemartin/utils';
import RelationNotLoaded from 'soukai-bis/errors/RelationNotLoaded';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
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
    private static relationsDisabledCount: number = 0;
    private static refreshesDisabledCount: number = 0;

    public static disableLoadingRelations(): void {
        this.relationsDisabledCount++;
    }

    public static enableLoadingRelations(): void {
        this.relationsDisabledCount = Math.max(this.relationsDisabledCount - 1, 0);
    }

    public static disableRefreshes(): void {
        this.refreshesDisabledCount++;
    }

    public static enableRefreshes(): void {
        this.refreshesDisabledCount = Math.max(this.refreshesDisabledCount - 1, 0);
    }

    private static get relationsDisabled(): boolean {
        return this.relationsDisabledCount > 0;
    }

    private static get refreshesDisabled(): boolean {
        return this.refreshesDisabledCount > 0;
    }

    public readonly invalidationStrategy: InvalidationStrategy;
    private name: string;
    private target: Model;
    private compute: ComputedAttributeCompute<Model, TValue>;
    private _value: TValue | undefined;
    private listeners: Set<ComputedAttributeListener<TValue>>;
    private ongoingUpdates: Map<string, { running: Promise<TValue | undefined>; queued?: Promise<TValue | undefined> }>;

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
        this.ongoingUpdates = new Map();
    }

    public get value(): TValue | undefined {
        return this._value;
    }

    public setValue(value: TValue | undefined): void {
        this._value = value;
    }

    public subscribe(listener: ComputedAttributeListener<TValue>): () => void {
        this.listeners.add(listener);

        // oxlint-disable-next-line typescript/no-floating-promises
        this.updateValue().then(listener);

        return () => this.listeners.delete(listener);
    }

    public updateValue(options: UpdateOptions = {}): Promise<TValue | undefined> {
        const filledOptions: Required<UpdateOptions> = {
            refresh: options.refresh ?? false,
            useCache: options.useCache ?? true,
            loadRelations: options.loadRelations ?? true,
        };
        const key = `${filledOptions.refresh}-${filledOptions.useCache}-${filledOptions.loadRelations}`;
        const ongoingUpdate = this.ongoingUpdates.get(key);

        if (!ongoingUpdate) {
            return this.startUpdate(key, filledOptions);
        }

        ongoingUpdate.queued ??= ongoingUpdate.running.then(
            () => this.startUpdate(key, filledOptions),
            () => this.startUpdate(key, filledOptions),
        );

        return ongoingUpdate.queued;
    }

    private startUpdate(key: string, options: Required<UpdateOptions>): Promise<TValue | undefined> {
        const running = this.performUpdate(options).finally(() => {
            const update = this.ongoingUpdates.get(key);

            if (update?.running === running && !update.queued) {
                this.ongoingUpdates.delete(key);
            }
        });

        this.ongoingUpdates.set(key, { running });

        return running;
    }

    private async performUpdate(options: Required<UpdateOptions>): Promise<TValue | undefined> {
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
        options: Required<UpdateOptions>,
        loadedRelations: { model: Model; relation: string }[],
    ): Promise<TValue | undefined> {
        if (!this.target.url) {
            return;
        }

        const refresh = !ComputedAttribute.refreshesDisabled && options.refresh;
        const useCache = options.useCache;
        const loadRelations = !ComputedAttribute.relationsDisabled && options.loadRelations;
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
