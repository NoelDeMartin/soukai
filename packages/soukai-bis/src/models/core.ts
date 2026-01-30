import Metadata from './crdts/Metadata';
import Operation from './crdts/Operation';
import SetPropertyOperation from './crdts/SetPropertyOperation';
import TypeIndex from './interop/TypeIndex';
import TypeRegistration from './interop/TypeRegistration';
import UnsetPropertyOperation from './crdts/UnsetPropertyOperation';
import { bootModels } from './registry';

export function bootCoreModels(reset: boolean = false): void {
    bootModels(
        {
            Metadata,
            Operation,
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
        Metadata: typeof Metadata;
        Operation: typeof Operation;
        SetPropertyOperation: typeof SetPropertyOperation;
        TypeIndex: typeof TypeIndex;
        TypeRegistration: typeof TypeRegistration;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}
