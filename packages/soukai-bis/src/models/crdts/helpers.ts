import type LifecycleOperation from 'soukai-bis/models/crdts/LifecycleOperation';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import type RestoreOperation from 'soukai-bis/models/crdts/RestoreOperation';
import type SoftDeleteOperation from 'soukai-bis/models/crdts/SoftDeleteOperation';
import { requireBootedModel } from 'soukai-bis/models/registry';

function getOperationPriority(operation: Operation): number {
    return isSoftDeleteOperation(operation) ? 1 : 0;
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

export function isPropertyOperation(operation: unknown): operation is PropertyOperation {
    return (
        operation instanceof requireBootedModel('SetPropertyOperation') ||
        operation instanceof requireBootedModel('UnsetPropertyOperation')
    );
}

export function isSoftDeleteOperation(operation: unknown): operation is SoftDeleteOperation {
    return operation instanceof requireBootedModel('SoftDeleteOperation');
}

export function isRestoreOperation(operation: unknown): operation is RestoreOperation {
    return operation instanceof requireBootedModel('RestoreOperation');
}

export function isLifecycleOperation(operation: unknown): operation is LifecycleOperation {
    return isSoftDeleteOperation(operation) || isRestoreOperation(operation);
}
