import { isInstanceOf, tap } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getRelatedClass, getRelatedClasses } from 'soukai-bis/models/relations/utils';
import { isMultiModelRelationClass } from 'soukai-bis/models/relations/helpers';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type { Nullable, Obj } from '@noeldemartin/utils';

import ComputedAttribute from './ComputedAttribute';
import RelationNotLoaded from 'soukai-bis/errors/RelationNotLoaded';
import type { ComputedAttributeCompute } from './ComputedAttribute';
import type { SchemaRelationDefinition } from 'soukai-bis/models/relations';

interface ComputedAttributesRegistryEntry {
    invalidationPaths: string[];
    relations: Record<string, RelationTree>;
}

const registry = new WeakMap<ModelConstructor, ComputedAttributesRegistryEntry>();

function relationPathsToTree(paths: string[][]): RelationTree {
    const tree: RelationTree = {};

    for (const path of paths) {
        let current = tree;

        for (const relation of path) {
            current[relation] = current[relation] ?? {};
            current = current[relation];
        }
    }

    return tree;
}

function simulatedModelProxy<T extends Model>(modelClass: ModelConstructor<T>, root: string[], visited: string[][]): T {
    return new Proxy(
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        (() => {}) as unknown as T,
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
            apply() {
                return simulatedModelProxy(modelClass, root, visited);
            },
        },
    ) as T;
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

function initComputedAttributes(modelClass: ModelConstructor): ComputedAttributesRegistryEntry {
    const invalidationPaths: string[] = [];
    const relations: Record<string, RelationTree> = {};

    for (const relatedClass of getRelatedClasses(modelClass)) {
        if (relatedClass === modelClass) {
            for (const [name, { compute }] of Object.entries(relatedClass.schema.computed)) {
                const visited = simulateComputedRun(relatedClass, compute);

                relations[name] = relationPathsToTree(visited);
                invalidationPaths.push(name);
            }

            continue;
        }

        for (const [name, { compute }] of Object.entries(relatedClass.schema.computed)) {
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
                    invalidationPaths.push(`${inversePath.join('.')}.${name}`);
                }
            }
        }
    }

    return tap({ invalidationPaths, relations }, (value) => {
        registry.set(modelClass, value);
    });
}

export interface RelationTree {
    [relationName: string]: RelationTree;
}

export function simulateComputedRun<TTarget extends Model = Model, TValue = unknown>(
    modelClass: ModelConstructor<TTarget>,
    compute: ComputedAttributeCompute<TTarget, TValue>,
): string[][] {
    const visited: string[][] = [];

    try {
        compute(simulatedModelProxy(modelClass, [], visited));
    } catch (error) {
        if (isInstanceOf(error, RelationNotLoaded)) {
            return visited;
        }

        throw error;
    }

    return visited;
}

export function getComputedAttributes(model: ModelConstructor): string[] {
    const entry = registry.get(model) ?? initComputedAttributes(model);

    return entry.invalidationPaths;
}

export function getComputedAttributeRelations(model: ModelConstructor, name: string): RelationTree {
    const entry = registry.get(model) ?? initComputedAttributes(model);

    return entry.relations[name] ?? {};
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
