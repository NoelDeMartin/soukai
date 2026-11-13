import { required } from '@noeldemartin/utils';
import { getSchema } from 'soukai-bis/models/internals/model';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type Relation from 'soukai-bis/models/relations/Relation';
import type { SchemaRelationDefinition } from 'soukai-bis/models/relations/schema';
import { remote } from 'soukai-bis/models/remote';
import type { ModelConstructor } from 'soukai-bis/models/types';

function collectRelatedClasses(modelClass: ModelConstructor, visited?: Set<ModelConstructor>): Set<ModelConstructor> {
    visited ??= new Set();

    if (!visited.has(modelClass)) {
        visited.add(modelClass);

        for (const relation of Object.values(getSchema(modelClass).relations)) {
            const relatedClass = getRelatedClass(modelClass, relation);

            collectRelatedClasses(relatedClass, visited);
        }
    }

    return visited;
}

export function getRelatedClass(parentClass: ModelConstructor, definition: SchemaRelationDefinition): ModelConstructor {
    const relatedClass = requireBootedModel(definition.relatedModelName);

    definition.relationClass.validateRelatedClass(parentClass, relatedClass);

    return parentClass.remote ? remote(relatedClass) : relatedClass;
}

export function createRelation(parent: Model, name: string): Relation {
    const definition = required(
        getSchema(parent.static()).relations[name],
        `Relation '${name}' is not defined in the ${parent.static().modelName} model.`,
    );
    const relatedClass = getRelatedClass(parent.static(), definition);

    return definition.relationClass.newInstance(parent, relatedClass, {
        foreignKeyName: definition.options.foreignKey,
        localKeyName: definition.options.localKey,
        usingSameDocument: definition.options.usingSameDocument,
        from: definition.options.from,
        onDelete: definition.options.onDelete,
    });
}

export function getRelatedClasses(modelClass: ModelConstructor): ModelConstructor[] {
    return Array.from(collectRelatedClasses(modelClass));
}
