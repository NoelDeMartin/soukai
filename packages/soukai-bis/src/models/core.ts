import Container from './ldp/Container';
import Metadata from './crdts/Metadata';
import Operation from './crdts/Operation';
import Person from './identity/Person';
import Resource from './ldp/Resource';
import SetPropertyOperation from './crdts/SetPropertyOperation';
import TypeIndex from './interop/TypeIndex';
import TypeRegistration from './interop/TypeRegistration';
import UnsetPropertyOperation from './crdts/UnsetPropertyOperation';
import { bootModels } from './registry';

export function bootCoreModels(reset: boolean = false): void {
    bootModels(
        {
            Container,
            Metadata,
            Operation,
            Person,
            Resource,
            SetPropertyOperation,
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
        TypeIndex: typeof TypeIndex;
        TypeRegistration: typeof TypeRegistration;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}
