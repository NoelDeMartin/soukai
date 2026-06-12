import { isInstanceOf, tap } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getRelatedClass, getRelatedClasses } from 'soukai-bis/models/relations/utils';
import { isMultiModelRelationClass } from 'soukai-bis/models/relations/helpers';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type { Nullable, Obj } from '@noeldemartin/utils';

import ComputedAttribute from './ComputedAttribute';
import type { ComputedAttributeCompute } from './ComputedAttribute';
import type { ComputedProxy } from './proxies';

const registry = new WeakMap<ModelConstructor, string[]>();

function simulateComputedRun(modelClass: ModelConstructor, compute: ComputedAttributeCompute): string[] {
    const visited: string[] = [];

    compute(simulatedModelProxy(modelClass, visited));

    return visited;
}

function simulatedModelProxy(modelClass: ModelConstructor, visited: string[]): ComputedProxy<Model> {
    return new Proxy(
        {},
        {
            get(_, property: string | symbol) {
                if (typeof property !== 'string') {
                    throw new SoukaiError('Unsupported computed attribute access');
                }

                const relatedClassDefinition = modelClass.schema.relations[property];
                const relatedClass = relatedClassDefinition && getRelatedClass(modelClass, relatedClassDefinition);

                if (relatedClass && isMultiModelRelationClass(relatedClassDefinition.relationClass)) {
                    visited.push(property);

                    return [simulatedModelProxy(relatedClass, visited)];
                }

                return simulatedModelProxy(modelClass, visited);
            },
            has() {
                return true;
            },
        },
    ) as ComputedProxy<Model>;
}

function getInverseRelationPath(
    originClass: ModelConstructor,
    targetClass: ModelConstructor,
): Record<string, string> | null {
    for (const [inverseRelationName, inverseRelationDefinition] of Object.entries(originClass.schema.relations)) {
        const inverseRelatedClass = getRelatedClass(originClass, inverseRelationDefinition);

        if (inverseRelatedClass === targetClass) {
            for (const [relationName, relationDefinition] of Object.entries(targetClass.schema.relations)) {
                const relatedClass = getRelatedClass(targetClass, relationDefinition);

                if (relatedClass === originClass) {
                    return { [inverseRelationName]: relationName };
                }
            }
        }
    }

    return null;
}

function initComputedAttributes(modelClass: ModelConstructor): string[] {
    const computedAttributes: string[] = [];

    for (const relatedClass of getRelatedClasses(modelClass)) {
        if (relatedClass === modelClass) {
            computedAttributes.push(...Object.keys(relatedClass.schema.computed));

            continue;
        }

        const inversePath = getInverseRelationPath(relatedClass, modelClass);

        if (!inversePath) {
            continue;
        }

        for (const [name, compute] of Object.entries(relatedClass.schema.computed)) {
            const [visited] = simulateComputedRun(relatedClass, compute);

            if (visited && visited in inversePath) {
                computedAttributes.push(`${inversePath[visited]}.${name}`);
            }
        }
    }

    return tap(computedAttributes, (value) => {
        registry.set(modelClass, value);
    });
}

export function getComputedAttributes(model: ModelConstructor): string[] {
    return registry.get(model) ?? initComputedAttributes(model);
}

export async function refreshComputedAttributes(model: Model): Promise<void> {
    const computedAttributes = getComputedAttributes(model.static() as ModelConstructor);

    for (const path of computedAttributes) {
        const computedAttribute = path
            .split('.')
            .reduce((target, segment) => target?.[segment] as Nullable<Obj>, model as unknown as Nullable<Obj>);

        if (!isInstanceOf(computedAttribute, ComputedAttribute)) {
            continue;
        }

        await computedAttribute.updateValue({ refresh: true });
    }
}
