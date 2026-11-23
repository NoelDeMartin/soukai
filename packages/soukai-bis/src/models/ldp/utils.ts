import { isSubclassOf } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import { requireBootedModel } from 'soukai-bis/models/registry';
import { isContainsRelationClass } from 'soukai-bis/models/relations/helpers';
import { isCoreRelation } from 'soukai-bis/models/relations/names';
import { getRelatedClass } from 'soukai-bis/models/relations/utils';

import type { ContainerConstructor, ModelConstructor } from '../types';
import { getContainerName, isModelClass } from '../utils';

function getContainedModelClass(containerClass: ContainerConstructor): ModelConstructor | null {
    for (const [relationName, definition] of Object.entries(containerClass.getRelations())) {
        if (isCoreRelation(relationName) || !isContainsRelationClass(definition.relationClass)) {
            continue;
        }

        const relatedClass = getRelatedClass(containerClass, definition);

        if (!isContainerClass(relatedClass)) {
            return relatedClass;
        }
    }

    return null;
}

export function isContainerClass(value: unknown): value is ContainerConstructor {
    const containerClass = requireBootedModel('Container');

    return isModelClass(value) && (value === containerClass || isSubclassOf(value, containerClass));
}

export function getRemoteContainerUrl(
    modelClass: ModelConstructor,
    storageUrl: string,
    path?: Nullable<string>,
): string {
    const namingClass = (isContainerClass(modelClass) && getContainedModelClass(modelClass)) || modelClass;
    const containerPath = `/${path ?? getContainerName(namingClass.modelName)}/`.replace(/\/+/g, '/');

    return storageUrl.replace(/\/$/, '') + containerPath;
}
