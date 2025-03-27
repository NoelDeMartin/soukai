import DocumentContainsManyRelation from './DocumentContainsManyRelation';
import OperationsRelation from './OperationsRelation';
import SolidACLAuthorizationsRelation from './SolidACLAuthorizationsRelation';
import SolidBelongsToManyRelation from './SolidBelongsToManyRelation';
import SolidBelongsToOneRelation from './SolidBelongsToOneRelation';
import SolidContainerDocumentsRelation from './SolidContainerDocumentsRelation';
import SolidContainsRelation from './SolidContainsRelation';
import SolidHasManyRelation from './SolidHasManyRelation';
import SolidHasOneRelation from './SolidHasOneRelation';
import SolidIsContainedByRelation from './SolidIsContainedByRelation';
import TombstoneRelation from './TombstoneRelation';
import type { DocumentContainsRelation } from './DocumentContainsRelation';

SolidContainsRelation.inverseRelationClasses = [SolidIsContainedByRelation];
SolidIsContainedByRelation.inverseRelationClasses = [SolidContainsRelation];

export * from './guards';
export * from './cardinality-guards';

export {
    DocumentContainsManyRelation,
    DocumentContainsRelation,
    OperationsRelation,
    SolidACLAuthorizationsRelation,
    SolidBelongsToManyRelation,
    SolidBelongsToOneRelation,
    SolidContainerDocumentsRelation,
    SolidContainsRelation,
    SolidHasManyRelation,
    SolidHasOneRelation,
    SolidIsContainedByRelation,
    TombstoneRelation,
};

export type { SolidBelongsToManyRelationBase } from './SolidBelongsToManyRelation';
export type { SolidBelongsToOneRelationBase } from './SolidBelongsToOneRelation';
export type { SolidHasManyRelationBase } from './SolidHasManyRelation';
export type { SolidHasOneRelationBase } from './SolidHasOneRelation';

export type { SolidRelation } from './inference';
export type {
    default as SolidBelongsToRelation,
    ProtectedSolidBelongsToRelation,
    This as SolidBelongsToRelationThis,
} from './mixins/SolidBelongsToRelation';
export type {
    default as SolidDocumentRelation,
    ISolidDocumentRelation,
    SolidDocumentRelationInstance,
} from './mixins/SolidDocumentRelation';
export type {
    default as SolidHasRelation,
    ProtectedSolidHasRelation,
    This as SolidHasRelationThis,
} from './mixins/SolidHasRelation';
export type {
    default as SolidMultiModelDocumentRelation,
    ProtectedSolidMultiRelation,
    SolidMultiModelDocumentRelationInstance,
    This as SolidMultiModelDocumentRelationThis,
} from './mixins/SolidMultiModelDocumentRelation';
export type {
    default as SolidSingleModelDocumentRelation,
    SolidSingleModelDocumentRelationInstance,
    This as SolidSingleModelDocumentRelationThis,
} from './mixins/SolidSingleModelDocumentRelation';
