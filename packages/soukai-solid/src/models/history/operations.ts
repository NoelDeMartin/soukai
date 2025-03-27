import { requireBootedModel } from 'soukai';

import type Operation from './Operation';
import type PropertyOperation from './PropertyOperation';
import type AddPropertyOperation from './AddPropertyOperation';
import type DeleteOperation from './DeleteOperation';
import type RemovePropertyOperation from './RemovePropertyOperation';
import type SetPropertyOperation from './SetPropertyOperation';
import type UnsetPropertyOperation from './UnsetPropertyOperation';

let operations: Operations;

export type Operations = {
    Operation: typeof Operation;
    PropertyOperation: typeof PropertyOperation;
    AddPropertyOperation: typeof AddPropertyOperation;
    RemovePropertyOperation: typeof RemovePropertyOperation;
    SetPropertyOperation: typeof SetPropertyOperation;
    UnsetPropertyOperation: typeof UnsetPropertyOperation;
    DeleteOperation: typeof DeleteOperation;
};

export function operationClass<T extends keyof Operations>(operation: T): Operations[T] {
    return operationClasses()[operation];
}

export function operationClasses(): Operations {
    return (operations ??= {
        Operation: requireBootedModel('Operation'),
        PropertyOperation: requireBootedModel('PropertyOperation'),
        AddPropertyOperation: requireBootedModel('AddPropertyOperation'),
        RemovePropertyOperation: requireBootedModel('RemovePropertyOperation'),
        SetPropertyOperation: requireBootedModel('SetPropertyOperation'),
        UnsetPropertyOperation: requireBootedModel('UnsetPropertyOperation'),
        DeleteOperation: requireBootedModel('DeleteOperation'),
    });
}
