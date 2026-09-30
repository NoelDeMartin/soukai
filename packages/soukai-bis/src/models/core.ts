import { coreOperationModels } from './crdts/core';
import Metadata from './crdts/Metadata';
import Operation from './crdts/Operation';
import Tombstone from './crdts/Tombstone';
import Person from './identity/Person';
import TypeIndex from './interop/TypeIndex';
import TypeRegistration from './interop/TypeRegistration';
import Container from './ldp/Container';
import Resource from './ldp/Resource';
import { bootModels } from './registry';
import type { BootOptions } from './registry';
import { bootCoreRelations } from './relations/core';
import type { ModelConstructor } from './types';

const coreModels = {
    Container,
    Metadata,
    Operation,
    Person,
    Resource,
    Tombstone,
    TypeIndex,
    TypeRegistration,
    ...coreOperationModels,
};

export function getCoreModels(): ModelConstructor[] {
    return Object.values(coreModels);
}

export function isCoreModel(modelClass: ModelConstructor): boolean {
    return getCoreModels().includes(modelClass);
}

export function bootCoreModels(options: BootOptions = {}): void {
    bootCoreRelations();
    bootModels(coreModels, options);
}

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Container: typeof Container;
        Metadata: typeof Metadata;
        Operation: typeof Operation;
        Resource: typeof Resource;
        Tombstone: typeof Tombstone;
        TypeIndex: typeof TypeIndex;
        TypeRegistration: typeof TypeRegistration;
    }
}
