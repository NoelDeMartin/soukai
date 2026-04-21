import { isModelClass } from 'soukai-bis/models/utils';
import type { SchemaRelationDefinition } from 'soukai-bis/models/relations/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';

function _getRelatedClasses(modelClass: ModelConstructor, visited?: Set<ModelConstructor>): Set<ModelConstructor> {
    visited ??= new Set();

    if (!visited.has(modelClass)) {
        visited.add(modelClass);

        for (const relation of Object.values(modelClass.schema.relations)) {
            const relatedClass = getRelatedClass(modelClass, relation);

            _getRelatedClasses(relatedClass, visited);
        }
    }

    return visited;
}

export function getRelatedClass(parentClass: ModelConstructor, definition: SchemaRelationDefinition): ModelConstructor {
    if (!isModelClass(definition.relatedClass)) {
        const relatedClass = (definition.relatedClass as () => ModelConstructor)();

        definition.relationClass.validateRelatedClass(parentClass, relatedClass);
        definition.relatedClass = relatedClass;
    }

    return definition.relatedClass;
}

export function getRelatedClasses(modelClass: ModelConstructor): ModelConstructor[] {
    return Array.from(_getRelatedClasses(modelClass));
}
