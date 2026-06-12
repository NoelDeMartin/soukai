import { arrayFrom } from '@noeldemartin/utils';

import { classMarker } from 'soukai-bis/models/relations/helpers';
import { getRelatedClass, getRelatedClasses } from 'soukai-bis/models/relations/utils';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type { RelationConstructor } from 'soukai-bis/models/relations/types';

import type { ComputedAttributeCompute } from './ComputedAttribute';
import type { ComputedProxy } from './proxies';

/**
 * Placeholder standing in for attribute values during simulations. It tolerates most operations
 * without throwing: property accesses and function calls return the placeholder itself, and
 * primitive conversions return empty values.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
const simulationValue: unknown = new Proxy(function() {}, {
    get: (_, property) => {
        switch (property) {
            case Symbol.toPrimitive:
            case 'toString':
                return () => '';
            case 'valueOf':
                return () => 0;
            case Symbol.iterator:
                return [][Symbol.iterator];
            default:
                return simulationValue;
        }
    },
    apply: () => simulationValue,
});

function isMultiModelRelationClass(relationClass: RelationConstructor): boolean {
    return classMarker in relationClass && arrayFrom(relationClass[classMarker]).includes('MultiModelRelation');
}

/**
 * Creates a fake model that records which relations are traversed, without reading any actual data.
 * Relations always resolve to fake related models (or arrays with one fake related model), and any
 * other property resolves to a tolerant placeholder value.
 */
function simulateModel(
    modelClass: ModelConstructor,
    visit: (relatedClass: ModelConstructor) => void,
    simulations: Map<ModelConstructor, unknown>,
): unknown {
    if (!simulations.has(modelClass)) {
        simulations.set(
            modelClass,
            new Proxy(
                {},
                {
                    get: (_, property) => {
                        const definition =
                            typeof property === 'string' ? modelClass.schema.relations[property] : undefined;

                        if (!definition) {
                            return simulationValue;
                        }

                        const relatedClass = getRelatedClass(modelClass, definition);

                        visit(relatedClass);

                        const relatedModel = simulateModel(relatedClass, visit, simulations);

                        return isMultiModelRelationClass(definition.relationClass) ? [relatedModel] : relatedModel;
                    },
                },
            ),
        );
    }

    return simulations.get(modelClass);
}

/**
 * Returns the model classes that a computed attribute depends on, by running a simulation of the
 * compute function that records which parts of the data graph are used (rather than actually
 * reading any models).
 *
 * The simulation is conservative: the model class itself is always included, and if the compute
 * function fails during the simulation, all the classes reachable through relations are included
 * instead.
 */
export function getComputedAttributeDependencies<T extends Model>(
    modelClass: ModelConstructor<T>,
    compute: ComputedAttributeCompute<T, unknown>,
): ModelConstructor[] {
    const dependencies = new Set<ModelConstructor>([modelClass]);

    try {
        compute(
            simulateModel(modelClass, (relatedClass) => dependencies.add(relatedClass), new Map()) as ComputedProxy<T>,
        );
    } catch {
        getRelatedClasses(modelClass).forEach((relatedClass) => dependencies.add(relatedClass));
    }

    return [...dependencies];
}
