import { requireBootedModel } from 'soukai-bis/models/registry';
import type { SchemaRelationDefinition } from 'soukai-bis/models/relations/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';

function collectRelatedClasses(modelClass: ModelConstructor, visited?: Set<ModelConstructor>): Set<ModelConstructor> {
    visited ??= new Set();

    if (!visited.has(modelClass)) {
        visited.add(modelClass);

        for (const relation of Object.values(modelClass.schema.relations)) {
            const relatedClass = getRelatedClass(modelClass, relation);

            collectRelatedClasses(relatedClass, visited);
        }
    }

    return visited;
}

export function getRelatedClass(parentClass: ModelConstructor, definition: SchemaRelationDefinition): ModelConstructor {
    const relatedClass = requireBootedModel(definition.relatedModelName);

    definition.relationClass.validateRelatedClass(parentClass, relatedClass);

    return relatedClass;
}

export function getRelatedClasses(modelClass: ModelConstructor): ModelConstructor[] {
    return Array.from(collectRelatedClasses(modelClass));
}
