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
import type { SchemaRelationDefinition } from 'soukai-bis/models/relations';

const registry = new WeakMap<ModelConstructor, string[]>();

function simulateComputedRun(modelClass: ModelConstructor, compute: ComputedAttributeCompute): string[][] {
    const visited: string[][] = [];

    compute(simulatedModelProxy(modelClass, [], visited));

    return visited;
}

function simulatedModelProxy(modelClass: ModelConstructor, root: string[], visited: string[][]): ComputedProxy<Model> {
    return new Proxy(
        {},
        {
            get(_, property: string | symbol) {
                if (typeof property !== 'string') {
                    throw new SoukaiError('Unsupported computed attribute access');
                }

                const relatedClassDefinition = modelClass.schema.relations[property];
                const relatedClass = relatedClassDefinition && getRelatedClass(modelClass, relatedClassDefinition);

                if (relatedClass) {
                    const route = [...root, property];
                    const relatedProxy = simulatedModelProxy(relatedClass, route, visited);

                    visited.push(route);

                    return isMultiModelRelationClass(relatedClassDefinition.relationClass)
                        ? [relatedProxy]
                        : relatedProxy;
                }

                return simulatedModelProxy(modelClass, root, visited);
            },
            has() {
                return true;
            },
        },
    ) as ComputedProxy<Model>;
}

function getInverseRelationName(
    fromClass: ModelConstructor,
    relationDefinition: SchemaRelationDefinition,
): string | null {
    const toClass = getRelatedClass(fromClass, relationDefinition);
    const fromForeignKey = relationDefinition.options.foreignKey;
    const inverseRelationEntry = Object.entries(toClass.schema.relations).find(([_, definition]) => {
        return fromForeignKey === definition.options.foreignKey && fromClass === getRelatedClass(toClass, definition);
    });

    return inverseRelationEntry?.[0] ?? null;
}

function resolveInverseRelationPath(originClass: ModelConstructor, path: string[]): string[] | null {
    let currentClass = originClass;
    const inversePath: string[] = [];

    for (const relation of path) {
        const relationDefinition = currentClass.schema.relations[relation];
        const inverseRelationName = relationDefinition && getInverseRelationName(currentClass, relationDefinition);

        if (!relationDefinition || !inverseRelationName) {
            return null;
        }

        inversePath.push(inverseRelationName);

        currentClass = getRelatedClass(currentClass, relationDefinition);
    }

    return inversePath.reverse();
}

function initComputedAttributes(modelClass: ModelConstructor): string[] {
    const computedAttributes: string[] = [];

    for (const relatedClass of getRelatedClasses(modelClass)) {
        if (relatedClass === modelClass) {
            computedAttributes.push(...Object.keys(relatedClass.schema.computed));

            continue;
        }

        for (const [name, compute] of Object.entries(relatedClass.schema.computed)) {
            const visited = simulateComputedRun(relatedClass, compute);

            pathLoop: for (const path of visited) {
                let resolvedClass = relatedClass;

                for (const relation of path) {
                    const relationDefinition = resolvedClass.schema.relations[relation];

                    if (!relationDefinition) {
                        continue pathLoop;
                    }

                    resolvedClass = getRelatedClass(resolvedClass, relationDefinition);
                }

                if (resolvedClass !== modelClass) {
                    continue;
                }

                const inversePath = resolveInverseRelationPath(relatedClass, path);

                if (inversePath) {
                    computedAttributes.push(`${inversePath.join('.')}.${name}`);
                }
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
            .reduce((target, relation) => target?.[relation] as Nullable<Obj>, model as unknown as Nullable<Obj>);

        if (!isInstanceOf(computedAttribute, ComputedAttribute)) {
            continue;
        }

        await computedAttribute.updateValue({ refresh: true });
    }
}
