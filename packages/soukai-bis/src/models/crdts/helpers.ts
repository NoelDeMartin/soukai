import type { Quad_Object } from '@rdfjs/types';
import { normalizeRDFIRI } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import type AddPropertyOperation from 'soukai-bis/models/crdts/AddPropertyOperation';
import type LifecycleOperation from 'soukai-bis/models/crdts/LifecycleOperation';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import type RemovePropertyOperation from 'soukai-bis/models/crdts/RemovePropertyOperation';
import type SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import type UnsetPropertyOperation from 'soukai-bis/models/crdts/UnsetPropertyOperation';
import type ValuePropertyOperation from 'soukai-bis/models/crdts/ValuePropertyOperation';
import { isBootedModelInstance, requireBootedModel } from 'soukai-bis/models/registry';

function getOperationPriority(operation: Operation): number {
    if (
        isBootedModelInstance(operation, 'DeleteOperation') ||
        isBootedModelInstance(operation, 'RemovePropertyOperation')
    ) {
        return 1;
    }

    if (isBootedModelInstance(operation, 'AddPropertyOperation')) {
        return 2;
    }

    return 0;
}

function includesValue(values: Quad_Object[], value: Quad_Object): boolean {
    return values.some((otherValue) => otherValue.equals(value));
}

function getEffectiveValues(
    operation: AddPropertyOperation | RemovePropertyOperation,
    operations: PropertyOperation[],
): Quad_Object[] {
    const newerOperations = operations.filter(
        (other) => other !== operation && sameProperty(operation, other) && supersedesOperation(other, operation),
    );

    if (newerOperations.some(isPropertyResetOperation)) {
        return [];
    }

    const newerValues = newerOperations.filter(isArrayPropertyOperation).flatMap((other) => other.values);

    return operation.values.filter((value) => !includesValue(newerValues, value));
}

function withValues<T extends ValuePropertyOperation>(operation: T, values: Quad_Object[]): T {
    if (valuesEqual(operation.values, values)) {
        return operation;
    }

    const OperationModel = operation.static();

    return (new OperationModel(operation.getAttributes()) as T)
        .setSubject(operation.subject)
        .setPredicate(operation.predicate)
        .setValues(values);
}

export function supersedesOperation(operation: Operation, other: Operation): boolean {
    const timeDifference = operation.date.getTime() - other.date.getTime();

    return (
        timeDifference > 0 || (timeDifference === 0 && getOperationPriority(operation) > getOperationPriority(other))
    );
}

export function sortedOperations<T extends Operation>(operations: T[]): T[] {
    return [...operations].sort(
        (a, b) => a.date.getTime() - b.date.getTime() || getOperationPriority(a) - getOperationPriority(b),
    );
}

export function getTombstoneUrl(resourceUrl: string): string {
    return resourceUrl.includes('#') ? `${resourceUrl}-tombstone` : `${resourceUrl}#tombstone`;
}

export function isPropertyOperation(operation: unknown): operation is PropertyOperation {
    return isPropertyResetOperation(operation) || isArrayPropertyOperation(operation);
}

export function isPropertyResetOperation(
    operation: unknown,
): operation is SetPropertyOperation | UnsetPropertyOperation {
    return (
        isBootedModelInstance(operation, 'SetPropertyOperation') ||
        isBootedModelInstance(operation, 'UnsetPropertyOperation')
    );
}

export function isArrayPropertyOperation(
    operation: unknown,
): operation is AddPropertyOperation | RemovePropertyOperation {
    return (
        isBootedModelInstance(operation, 'AddPropertyOperation') ||
        isBootedModelInstance(operation, 'RemovePropertyOperation')
    );
}

export function isLifecycleOperation(operation: unknown): operation is LifecycleOperation {
    return isBootedModelInstance(operation, 'DeleteOperation') || isBootedModelInstance(operation, 'RestoreOperation');
}

export function getPropertyOperationKey(operation: PropertyOperation): string {
    return `${operation.resourceUrl}|${normalizeRDFIRI(operation.property)}`;
}

export function sameProperty(operation: PropertyOperation, other: PropertyOperation): boolean {
    return (
        operation.resourceUrl === other.resourceUrl &&
        normalizeRDFIRI(operation.property) === normalizeRDFIRI(other.property)
    );
}

export function valuesEqual(values: Quad_Object[], otherValues: Quad_Object[]): boolean {
    return (
        values.length === otherValues.length &&
        values.every((value) => includesValue(otherValues, value)) &&
        otherValues.every((value) => includesValue(values, value))
    );
}

export function foldPropertyOperations(operations: PropertyOperation[]): Quad_Object[] {
    let values: Quad_Object[] = [];

    for (const operation of sortedOperations(operations)) {
        if (isBootedModelInstance(operation, 'SetPropertyOperation')) {
            values = [...operation.values];

            continue;
        }

        if (isBootedModelInstance(operation, 'AddPropertyOperation')) {
            values = values.concat(operation.values.filter((value) => !includesValue(values, value)));

            continue;
        }

        if (isBootedModelInstance(operation, 'RemovePropertyOperation')) {
            values = values.filter((value) => !includesValue(operation.values, value));

            continue;
        }

        values = [];
    }

    return values;
}

export function isSupersededResetOperation(operation: PropertyOperation, operations: PropertyOperation[]): boolean {
    return operations.some(
        (other) =>
            other !== operation &&
            isPropertyResetOperation(other) &&
            sameProperty(operation, other) &&
            supersedesOperation(other, operation),
    );
}

export function withEffectiveValues<T extends AddPropertyOperation | RemovePropertyOperation>(
    operation: T,
    operations: PropertyOperation[],
): T | null {
    const values = getEffectiveValues(operation, operations);

    return values.length === 0 ? null : (withValues(operation, values) as T);
}

export function createPropertyResetOperation(
    operation: PropertyOperation,
    values: Quad_Object[],
    date: Date = operation.date,
): PropertyOperation {
    const attributes = { resourceUrl: operation.resourceUrl, property: operation.property, date };
    const resetOperation =
        values.length === 0
            ? new (requireBootedModel('UnsetPropertyOperation'))(attributes)
            : new (requireBootedModel('SetPropertyOperation'))({
                  ...attributes,
                  value: values.map((value) => value.value),
              }).setValues(values);

    return resetOperation.setSubject(operation.subject).setPredicate(operation.predicate);
}
