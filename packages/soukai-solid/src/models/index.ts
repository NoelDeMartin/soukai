import { bootModels } from 'soukai';

import { historyModels } from './history/index';

import SolidACLAuthorization from './SolidACLAuthorization';
import SolidContainer from './SolidContainer';
import SolidDocument from './SolidDocument';
import SolidTypeIndex from './SolidTypeIndex';
import SolidTypeRegistration from './SolidTypeRegistration';

export * from './helpers';
export * from './history/index';
export * from './inference';
export * from './relations/index';
export * from './schema';
export * from './schema-container';
export * from './SolidModel';
export * from './SolidContainer.schema';

export { SolidACLAuthorization, SolidContainer, SolidDocument, SolidTypeIndex, SolidTypeRegistration };

export { default as SolidACLAuthorizationSchema } from './SolidACLAuthorization.schema';
export { default as SolidContainerSchema } from './SolidContainer.schema';
export { default as SolidDocumentSchema } from './SolidDocument.schema';
export { default as SolidTypeIndexSchema } from './SolidTypeIndex.schema';
export { default as SolidTypeRegistrationSchema } from './SolidTypeRegistration.schema';

export type { default as DeletesModels } from './mixins/DeletesModels';
export type { default as ManagesPermissions } from './mixins/ManagesPermissions';
export type { default as MigratesSchemas } from './mixins/MigratesSchemas';
export type { default as SerializesToJsonLD } from './mixins/SerializesToJsonLD';
export type { default as TracksHistory } from './mixins/TracksHistory';
export type { MigrateSchemaOptions } from './mixins/MigratesSchemas';
export type { PermissionsTracker } from './mixins/ManagesPermissions';
export type { SerializeOptions } from './mixins/SerializesToJsonLD';

export type { This as DeletesModelsThis } from './mixins/DeletesModels';
export type { This as ManagesPermissionsThis } from './mixins/ManagesPermissions';
export type { This as MigratesSchemasThis } from './mixins/MigratesSchemas';
export type { This as SerializesToJsonLDThis } from './mixins/SerializesToJsonLD';
export type { This as TracksHistoryThis } from './mixins/TracksHistory';

export type {
    RDFContexts,
    SolidBootedFieldDefinition,
    SolidBootedFieldsDefinition,
    SolidFieldDefinition,
    SolidFieldsDefinition,
    SolidSchemaDefinition,
} from './fields';

export function bootSolidModels(): void {
    bootModels({
        ...historyModels,
        SolidACLAuthorization,
        SolidContainer,
        SolidDocument,
        SolidTypeIndex,
        SolidTypeRegistration,
    });
}
