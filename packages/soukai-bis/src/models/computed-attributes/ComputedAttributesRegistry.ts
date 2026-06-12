import { facade } from '@noeldemartin/utils';

import { onModelEvent } from 'soukai-bis/models/concerns/events';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import { getComputedAttributeDependencies } from './dependencies';

/**
 * Keeps computed attributes up to date when their source models change, so that values (and their
 * cache) don't go stale even if the computed attributes haven't been instantiated yet. By the time
 * a value is needed, the source relationships may no longer be loaded, so refreshing must happen
 * while they still are.
 *
 * Everything is wired up during model booting: the source model classes of each computed attribute
 * are determined by simulating the compute function (see `getComputedAttributeDependencies`), and
 * model events are listened once per source class. Model instances are only referenced weakly, so
 * tracking them doesn't prevent them from being garbage collected.
 */
export class ComputedAttributesRegistry {

    private affectedAttributes = new WeakMap<ModelConstructor, Map<ModelConstructor, Set<string>>>();
    private watchedClasses = new WeakSet<ModelConstructor>();
    private trackedInstances = new WeakMap<ModelConstructor, Set<WeakRef<Model>>>();

    /**
     * Wires up refreshing the computed attributes of the given model class, called during booting.
     */
    public watch(modelClass: ModelConstructor): void {
        for (const [name, compute] of Object.entries(modelClass.schema.computed)) {
            for (const sourceClass of getComputedAttributeDependencies(modelClass, compute)) {
                this.getAffectedAttributes(sourceClass, modelClass).add(name);
                this.listen(sourceClass);
            }
        }
    }

    /**
     * Starts tracking a model instance, in order to refresh its computed attributes when source
     * models change. Instances without computed attributes are ignored.
     */
    public track(model: Model): void {
        const modelClass = model.static() as ModelConstructor;

        if (Object.keys(modelClass.schema.computed).length === 0) {
            return;
        }

        this.getTrackedInstances(modelClass).add(new WeakRef(model));
    }

    private getAffectedAttributes(sourceClass: ModelConstructor, modelClass: ModelConstructor): Set<string> {
        const sourceAffectedAttributes =
            this.affectedAttributes.get(sourceClass) ?? new Map<ModelConstructor, Set<string>>();
        const attributes = sourceAffectedAttributes.get(modelClass) ?? new Set<string>();

        sourceAffectedAttributes.set(modelClass, attributes);
        this.affectedAttributes.set(sourceClass, sourceAffectedAttributes);

        return attributes;
    }

    private getTrackedInstances(modelClass: ModelConstructor): Set<WeakRef<Model>> {
        const instances = this.trackedInstances.get(modelClass) ?? new Set<WeakRef<Model>>();

        this.trackedInstances.set(modelClass, instances);

        return instances;
    }

    private listen(sourceClass: ModelConstructor): void {
        if (this.watchedClasses.has(sourceClass)) {
            return;
        }

        this.watchedClasses.add(sourceClass);

        onModelEvent(sourceClass, 'saved', () => this.refreshAffectedAttributes(sourceClass));
        onModelEvent(sourceClass, 'deleted', () => this.refreshAffectedAttributes(sourceClass));
        onModelEvent(sourceClass, 'relation-loaded', () => this.refreshAffectedAttributes(sourceClass));
    }

    private async refreshAffectedAttributes(sourceClass: ModelConstructor): Promise<void> {
        const sourceAffectedAttributes = this.affectedAttributes.get(sourceClass);

        if (!sourceAffectedAttributes) {
            return;
        }

        const updates: Promise<unknown>[] = [];

        for (const [modelClass, names] of sourceAffectedAttributes) {
            const references = this.trackedInstances.get(modelClass) ?? new Set();

            for (const reference of references) {
                const model = reference.deref();

                if (!model) {
                    references.delete(reference);

                    continue;
                }

                for (const name of names) {
                    updates.push(model.getComputedAttribute(name).refresh());
                }
            }
        }

        await Promise.all(updates);
    }

}

export default facade(ComputedAttributesRegistry);
