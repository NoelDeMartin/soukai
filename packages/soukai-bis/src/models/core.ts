import Metadata from './crdts/Metadata';
import { bootModels } from './registry';

export function bootCoreModels(reset: boolean = false): void {
    bootModels({ Metadata }, reset);
}

declare module './registry' {
    interface ModelsRegistry {
        Metadata: typeof Metadata;
    }
}
