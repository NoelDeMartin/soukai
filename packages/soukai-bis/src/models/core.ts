import ACLAuthorization from './acl/ACLAuthorization';
import ACPAccessControl from './acp/ACPAccessControl';
import ACPAccessControlResource from './acp/ACPAccessControlResource';
import ACPMatcher from './acp/ACPMatcher';
import ACPPolicy from './acp/ACPPolicy';
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
    ACLAuthorization,
    ACPAccessControl,
    ACPAccessControlResource,
    ACPMatcher,
    ACPPolicy,
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
        ACLAuthorization: typeof ACLAuthorization;
        ACPAccessControl: typeof ACPAccessControl;
        ACPAccessControlResource: typeof ACPAccessControlResource;
        ACPMatcher: typeof ACPMatcher;
        ACPPolicy: typeof ACPPolicy;
        Container: typeof Container;
        Metadata: typeof Metadata;
        Operation: typeof Operation;
        Resource: typeof Resource;
        Tombstone: typeof Tombstone;
        TypeIndex: typeof TypeIndex;
        TypeRegistration: typeof TypeRegistration;
    }
}
