import { RDFNamedNode } from '@noeldemartin/solid-utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type { Schema } from 'soukai-bis/models/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';

const IMMUTABLE_CONFIG = ['timestamps', 'history', 'tombstone'] as const;

export function updateModelSchema(modelClass: ModelConstructor, overrides: Schema): Schema {
    const original = modelClass.schema;

    for (const property of IMMUTABLE_CONFIG) {
        if (overrides[property] === original[property]) {
            continue;
        }

        throw new SoukaiError(`Can't combine schemas, ${property} should be the same.`);
    }

    for (const relation of Object.keys(overrides.relations)) {
        if (relation in original.relations) {
            continue;
        }

        throw new SoukaiError(`Can't combine schemas, cannot add new relation '${relation}'.`);
    }

    return {
        fields: overrides.fields,
        relations: original.relations,
        computed: original.computed,
        timestamps: original.timestamps,
        history: original.history,
        tombstone: original.tombstone,
        rdfContext: { ...overrides.rdfContext },
        rdfClasses:
            overrides.rdfClasses.length > 0
                ? [...overrides.rdfClasses]
                : [new RDFNamedNode(`${overrides.rdfContext.default}${modelClass.modelName}`)],
        rdfDefaultResourceHash: overrides.rdfDefaultResourceHash,
        rdfFieldProperties: { ...overrides.rdfFieldProperties },
        slugField: overrides.slugField,
    };
}
