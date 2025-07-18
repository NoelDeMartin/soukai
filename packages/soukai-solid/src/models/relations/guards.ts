import { usesMixin } from '@noeldemartin/utils';
import type { Relation } from 'soukai';

import SolidBelongsToRelation from 'soukai-solid/models/relations/mixins/SolidBelongsToRelation';
import SolidHasRelation from 'soukai-solid/models/relations/mixins/SolidHasRelation';
import type { SolidDocumentRelationInstance } from 'soukai-solid/models/relations/mixins/SolidDocumentRelation';
import type { SolidModel, SynchronizeCloneOptions } from 'soukai-solid/models/SolidModel';

export interface BeforeParentCreateRelation extends Relation {
    __beforeParentCreate(): void;
}

export interface AfterParentSaveRelation extends Relation {
    __afterParentSave(): void;
}

export interface SynchronizesRelatedModels extends Relation {
    __synchronizeRelated(
        other: Relation,
        options: { models: WeakSet<SolidModel> } & SynchronizeCloneOptions
    ): Promise<void>;
}

export function hasBeforeParentCreateHook(relation: Relation): relation is BeforeParentCreateRelation {
    return '__beforeParentCreate' in relation;
}

export function hasAfterParentSaveHook(relation: Relation): relation is AfterParentSaveRelation {
    return '__afterParentSave' in relation;
}

export function isSolidDocumentRelation(relation: Relation): relation is SolidDocumentRelationInstance {
    return 'useSameDocument' in relation;
}

export function isSolidBelongsToRelation(relation: unknown): relation is SolidBelongsToRelation {
    return usesMixin(relation, SolidBelongsToRelation);
}

export function isSolidHasRelation(relation: unknown): relation is SolidHasRelation {
    return usesMixin(relation, SolidHasRelation);
}

export function synchronizesRelatedModels(relation: Relation): relation is SynchronizesRelatedModels {
    return '__synchronizeRelated' in relation;
}
