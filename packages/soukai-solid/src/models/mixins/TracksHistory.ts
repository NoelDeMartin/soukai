import {
    arrayDiff,
    arrayFilter,
    arrayFrom,
    arraySorted,
    arrayWithout,
    isPromise,
    md5,
    objectWithout,
    objectWithoutEmpty,
    when,
} from '@noeldemartin/utils';
import { FieldType, ModelKey, SoukaiError, TimestampField, isArrayFieldDefinition } from 'soukai';
import type { Attributes } from 'soukai';

import { operationClass } from 'soukai-solid/models/history/operations';
import { synchronizesRelatedModels } from 'soukai-solid/models/relations/guards';
import type Operation from 'soukai-solid/models/history/Operation';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

const historyDisabled = new WeakMap<SolidModel, void>();

type ProtectedProperties = {
    _attributes: Attributes;
    _dirtyAttributes: Attributes;
    _trackedDirtyAttributes: Attributes;
    _originalAttributes: Attributes;
    _removedResourceUrls: string[];
};

function get<T extends keyof ProtectedProperties>(self: This, property: T): ProtectedProperties[T] {
    return (self as unknown as ProtectedProperties)[property];
}

export type This = SolidModel & TracksHistory;

export async function synchronizeModels(a: SolidModel, b: SolidModel): Promise<void> {
    if (a.getPrimaryKey() !== b.getPrimaryKey()) {
        throw new SoukaiError('Can\'t synchronize different models');
    }

    await a.loadRelationIfUnloaded('operations');
    await b.loadRelationIfUnloaded('operations');

    if (a.operations.length === 0 && b.operations.length === 0) {
        return;
    }

    if (a.getHistoryHash() === b.getHistoryHash()) {
        return;
    }

    a.addHistoryOperations(b.operations);
    b.addHistoryOperations(a.operations);

    for (const relation of arrayWithout(a.static().relations, a.static().reservedRelations)) {
        const relationA = a.requireRelation(relation);
        const relationB = b.requireRelation(relation);

        if (!relationA.enabled || !relationB.enabled) {
            continue;
        }

        await when(relationA, synchronizesRelatedModels).__synchronizeRelated(relationB);
        await when(relationB, synchronizesRelatedModels).__synchronizeRelated(relationA);
    }
}

export default class TracksHistory {

    declare private _history?: boolean;
    declare private _tombstone?: boolean;

    public tracksHistory(this: This): boolean {
        return historyDisabled.has(this) ? false : (this._history ?? this.static('history'));
    }

    public withoutTrackingHistory<T>(this: This, operation: () => T): T;
    public withoutTrackingHistory<T>(this: This, operation: () => Promise<T>): Promise<T>;
    public withoutTrackingHistory<T>(this: This, operation: () => T | Promise<T>): T | Promise<T> {
        if (!this.tracksHistory()) {
            return operation();
        }

        const restoreHistoryTracking = (): true => {
            historyDisabled.delete(this);

            return true;
        };

        historyDisabled.set(this);

        const result = operation();

        return isPromise(result)
            ? result.then((value) => restoreHistoryTracking() && value)
            : restoreHistoryTracking() && result;
    }

    public enableHistory(): void {
        this._history = true;
    }

    public disableHistory(): void {
        this._history = false;
    }

    public disableTombstone(): void {
        this._tombstone = false;
    }

    public enableTombstone(): void {
        this._tombstone = true;
    }

    public leavesTombstone(this: This): boolean {
        return this._tombstone ?? this.static('tombstone');
    }

    public getHistoryHash(this: This): string | null {
        const relatedOperations = this.getRelatedModels()
            .map((model) => model.operations ?? [])
            .flat();

        return relatedOperations.length === 0
            ? null
            : md5(arraySorted(relatedOperations, 'url').reduce((digest, operation) => digest + operation.url, ''));
    }

    public rebuildAttributesFromHistory(this: This): void {
        if (!this.hasRelation('operations') || !this.isRelationLoaded('operations')) {
            throw new SoukaiError('Can\'t rebuild attributes from history if \'operations\'  relation isn\'t loaded');
        }

        if (this.operations.length === 0) {
            return;
        }

        const PropertyOperation = operationClass('PropertyOperation');
        const operations = arraySorted(this.operations, 'date');
        const unfilledAttributes = new Set(Object.keys(get(this, '_attributes')));
        const arrayFields = Object.entries(this.static('fields'))
            .filter(([_, definition]) => definition.type === FieldType.Array)
            .map(([field]) => field);

        unfilledAttributes.delete(this.static('primaryKey'));
        unfilledAttributes.delete(TimestampField.CreatedAt);
        unfilledAttributes.delete(TimestampField.UpdatedAt);

        arrayFields.forEach((field) => this.setAttribute(field, []));
        operations.forEach((operation) => {
            if (operation instanceof PropertyOperation) {
                const field = this.static().getRdfPropertyField(operation.property);

                field && unfilledAttributes.delete(field);
            }

            operation.apply(this);
        });
        unfilledAttributes.forEach((attribute) => this.unsetAttribute(attribute));

        this.setAttribute('createdAt', operations[0]?.date);
        this.setAttribute('updatedAt', operations[operations.length - 1]?.date);
    }

    public addHistoryOperations(this: This, operations: Operation[]): void {
        const PropertyOperation = operationClass('PropertyOperation');
        const knownOperationUrls = new Set(this.operations.map((operation) => operation.url));
        const newOperations: Operation[] = [];
        const trackedDirtyProperties: Set<string> = new Set();
        const fieldPropertiesMap = Object.keys(this.static('fields')).reduce(
            (fieldProperties, field) => {
                const rdfProperty = this.static().getFieldRdfProperty(field);

                if (rdfProperty) {
                    fieldProperties[rdfProperty] = field;
                }

                return fieldProperties;
            },
            {} as Record<string, string>,
        );

        for (const operation of operations) {
            if (knownOperationUrls.has(operation.url)) {
                continue;
            }

            if (operation instanceof PropertyOperation && this.ignoreRdfPropertyHistory(operation.property)) {
                continue;
            }

            const newOperation = operation.clone();

            newOperation.reset();
            newOperation.url = operation.url;

            newOperations.push(newOperation);

            if (operation instanceof PropertyOperation && operation.property in fieldPropertiesMap) {
                trackedDirtyProperties.add(operation.property);
            }
        }

        if (!newOperations.some((operation) => !operation.isInception(this))) {
            return;
        }

        this.setRelationModels('operations', arraySorted([...this.operations, ...newOperations], ['date', 'url']));
        this.removeDuplicatedHistoryOperations();
        this.rebuildAttributesFromHistory();

        for (const trackedDirtyProperty of trackedDirtyProperties) {
            const field = fieldPropertiesMap[trackedDirtyProperty] as string;

            get(this, '_trackedDirtyAttributes')[field] = get(this, '_dirtyAttributes')[field];
        }
    }

    protected async addDirtyHistoryOperations(this: This): Promise<void> {
        const trackedDirtyAttributes = get(this, '_trackedDirtyAttributes');

        await this.loadRelationIfUnloaded('operations');

        if ('url' in get(this, '_dirtyAttributes')) {
            throw new SoukaiError(
                'It wasn\'t possible to generate the changes history for a model because ' +
                    `its primary key was modified from '${this.url}' to '${get(this, '_originalAttributes').url}'.`,
            );
        }

        if (this.operations.length === 0) {
            const originalAttributes = objectWithoutEmpty(
                objectWithout(get(this, '_originalAttributes'), [this.static('primaryKey')]),
            );

            for (const [field, value] of Object.entries(originalAttributes)) {
                if (value === null || (Array.isArray(value) && value.length === 0)) {
                    continue;
                }

                if (field in trackedDirtyAttributes && trackedDirtyAttributes[field] === value) {
                    continue;
                }

                const rdfProperty = this.static().getFieldRdfProperty(field);

                if (rdfProperty && this.ignoreRdfPropertyHistory(rdfProperty)) {
                    continue;
                }

                this.relatedOperations.attachSetOperation({
                    property: this.static().requireFieldRdfProperty(field),
                    date: this.metadata.createdAt,
                    value: this.getOperationValue(field, value),
                });
            }
        }

        for (const [field, value] of Object.entries(get(this, '_dirtyAttributes'))) {
            if (field in trackedDirtyAttributes && trackedDirtyAttributes[field] === value) {
                continue;
            }

            const rdfProperty = this.static().getFieldRdfProperty(field);

            if (rdfProperty && this.ignoreRdfPropertyHistory(rdfProperty)) {
                continue;
            }

            if (Array.isArray(value)) {
                this.addArrayHistoryOperations(field, value, get(this, '_originalAttributes')[field]);

                continue;
            }

            if (value === null || value === undefined) {
                this.relatedOperations.attachUnsetOperation({
                    property: this.static().requireFieldRdfProperty(field),
                    date: this.metadata.updatedAt,
                });

                continue;
            }

            this.relatedOperations.attachSetOperation({
                property: this.static().requireFieldRdfProperty(field),
                date: this.metadata.updatedAt,
                value: this.getOperationValue(field, value),
            });
        }

        if (this.metadata.isDirty('deletedAt') && !!this.metadata.deletedAt) {
            this.relatedOperations.attachDeleteOperation({ date: this.metadata.deletedAt });
        }
    }

    protected removeDuplicatedHistoryOperations(this: This): void {
        const PropertyOperation = operationClass('PropertyOperation');
        const inceptionProperties: string[] = [];
        const duplicatedOperationUrls: string[] = [];
        const inceptionOperations = this.operations.filter((operation) => operation.isInception(this));
        const isNotDuplicated = (operation: Operation): boolean => !duplicatedOperationUrls.includes(operation.url);

        for (const inceptionOperation of inceptionOperations) {
            if (!(inceptionOperation instanceof PropertyOperation)) {
                continue;
            }

            if (!inceptionProperties.includes(inceptionOperation.property)) {
                inceptionProperties.push(inceptionOperation.property);

                continue;
            }

            duplicatedOperationUrls.push(inceptionOperation.url);

            if (inceptionOperation.exists()) {
                get(this, '_removedResourceUrls').push(inceptionOperation.url);
            }
        }

        this.setRelationModels('operations', this.operations.filter(isNotDuplicated));
    }

    protected getOperationValue(this: This, field: string, value: unknown): unknown {
        const definition = this.static().getFieldDefinition(field, value);

        if (isArrayFieldDefinition(definition)) {
            return arrayFilter(
                arrayFrom(value, true).map((itemValue) => this.getOperationValue(`${field}.*`, itemValue)),
            );
        }

        if (value && definition.type === FieldType.Key) {
            return new ModelKey(value);
        }

        return value;
    }

    protected addArrayHistoryOperations(this: This, field: string, dirtyValue: unknown, originalValue: unknown): void {
        const originalValues = arrayFrom(this.getOperationValue(field, originalValue), true);
        const dirtyValues = arrayFrom(this.getOperationValue(field, dirtyValue), true);
        const { added, removed } = arrayDiff(originalValues, dirtyValues, (a, b) => {
            if (a instanceof ModelKey && b instanceof ModelKey) {
                return a.equals(b);
            }

            return a === b;
        });

        if (added.length > 0) {
            this.relatedOperations.attachAddOperation({
                property: this.static().getFieldRdfProperty(field),
                date: this.metadata.updatedAt,
                value: arrayFilter(added),
            });
        }

        if (removed.length > 0) {
            this.relatedOperations.attachRemoveOperation({
                property: this.static().getFieldRdfProperty(field),
                date: this.metadata.updatedAt,
                value: arrayFilter(removed),
            });
        }
    }

    protected reconcileModelTimestamps(this: This, wasTouchedBeforeSaving: boolean): void {
        const [firstOperation, ...otherOperations] = this.operations ?? [];

        if (firstOperation) {
            this.setAttribute(
                TimestampField.UpdatedAt,
                otherOperations.reduce(
                    (updatedAt, operation) => (updatedAt > operation.date ? updatedAt : operation.date),
                    firstOperation.date,
                ),
            );

            return;
        }

        if (wasTouchedBeforeSaving) {
            return;
        }

        const originalUpdatedAt =
            get(this, '_originalAttributes')[TimestampField.UpdatedAt] ??
            this.metadata?.getOriginalAttribute(TimestampField.UpdatedAt);

        if (!originalUpdatedAt) {
            return;
        }

        const dirtyAttributes = Object.keys(get(this, '_dirtyAttributes'));

        if (dirtyAttributes[1]) {
            return;
        }

        if (dirtyAttributes[0] && dirtyAttributes[0] !== TimestampField.UpdatedAt) {
            return;
        }

        this.setAttribute(TimestampField.UpdatedAt, originalUpdatedAt);
    }

}
