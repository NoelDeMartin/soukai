import Container from './ldp/Container';
import Metadata from './crdts/Metadata';
import Operation from './crdts/Operation';
import Person from './identity/Person';
import Resource from './ldp/Resource';
import SetPropertyOperation from './crdts/SetPropertyOperation';
import Tombstone from './crdts/Tombstone';
import TypeIndex from './interop/TypeIndex';
import TypeRegistration from './interop/TypeRegistration';
import UnsetPropertyOperation from './crdts/UnsetPropertyOperation';
import { bootModels } from './registry';
import { bootCoreRelations } from './relations/core';

export function bootCoreModels(reset: boolean = false): void {
    bootCoreRelations();

    bootModels(
        {
            Container,
            Metadata,
            Operation,
            Person,
            Resource,
            SetPropertyOperation,
            Tombstone,
            TypeIndex,
            TypeRegistration,
            UnsetPropertyOperation,
        },
        reset,
    );
}

declare module './registry' {
    interface ModelsRegistry {
        Container: typeof Container;
        Metadata: typeof Metadata;
        Operation: typeof Operation;
        Resource: typeof Resource;
        SetPropertyOperation: typeof SetPropertyOperation;
        Tombstone: typeof Tombstone;
        TypeIndex: typeof TypeIndex;
        TypeRegistration: typeof TypeRegistration;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}
