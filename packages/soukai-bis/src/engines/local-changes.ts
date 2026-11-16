import { arrayUnique } from '@noeldemartin/utils';

import type { DocumentLocalChanges, ResourceLocalChanges, ResourceLocalState } from './LocalEngine';

const STATE_PRIORITIES: Record<ResourceLocalState, number> = { updated: 1, created: 2, deleted: 3 };

function resourceLocalChanges(state: ResourceLocalState, operations: string[] = []): ResourceLocalChanges {
    return state !== 'deleted' && operations.length > 0 ? { state, operations } : { state };
}

function cloneLocalChanges(changes: DocumentLocalChanges | null | undefined): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes?.resources ?? {}).map(([url, resourceChanges]) => [
                url,
                resourceLocalChanges(resourceChanges.state, resourceChanges.operations),
            ]),
        ),
    };
}

export function mergeLocalChanges(
    changes: DocumentLocalChanges | null | undefined,
    other: DocumentLocalChanges | null | undefined,
): DocumentLocalChanges {
    const merged = cloneLocalChanges(changes);

    for (const [url, otherChanges] of Object.entries(other?.resources ?? {})) {
        const resourceChanges = merged.resources[url];
        const state =
            resourceChanges && STATE_PRIORITIES[resourceChanges.state] >= STATE_PRIORITIES[otherChanges.state]
                ? resourceChanges.state
                : otherChanges.state;

        merged.resources[url] = resourceLocalChanges(
            state,
            arrayUnique([...(resourceChanges?.operations ?? []), ...(otherChanges.operations ?? [])]),
        );
    }

    return merged;
}

export function subtractLocalChanges(
    changes: DocumentLocalChanges | null | undefined,
    subtracted: DocumentLocalChanges | null | undefined,
): DocumentLocalChanges {
    const remaining = cloneLocalChanges(changes);

    for (const [url, subtractedChanges] of Object.entries(subtracted?.resources ?? {})) {
        const resourceChanges = remaining.resources[url];

        if (!resourceChanges) {
            continue;
        }

        const operations = (resourceChanges.operations ?? []).filter(
            (operationUrl) => !subtractedChanges.operations?.includes(operationUrl),
        );

        if (subtractedChanges.state !== resourceChanges.state) {
            remaining.resources[url] = resourceLocalChanges(resourceChanges.state, operations);

            continue;
        }

        if (operations.length === 0) {
            delete remaining.resources[url];

            continue;
        }

        remaining.resources[url] = resourceLocalChanges('updated', operations);
    }

    return remaining;
}

export function withCreatedAsUpdated(changes: DocumentLocalChanges): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes.resources).map(([url, resourceChanges]) => [
                url,
                resourceChanges.state === 'created'
                    ? resourceLocalChanges('updated', resourceChanges.operations)
                    : resourceChanges,
            ]),
        ),
    };
}

export function getLocallyDeletedResourceUrls(changes: DocumentLocalChanges | null | undefined): Set<string> {
    return new Set(
        Object.entries(changes?.resources ?? {})
            .filter(([_, resourceChanges]) => resourceChanges.state === 'deleted')
            .map(([url]) => url),
    );
}

export function hasLocalDeletions(changes: DocumentLocalChanges | null | undefined): boolean {
    return Object.values(changes?.resources ?? {}).some((resourceChanges) => resourceChanges.state === 'deleted');
}

export function migrateLocalChanges(
    changes: DocumentLocalChanges,
    migrateUrl: (url: string) => string | null,
): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes.resources).map(([url, resourceChanges]) => [
                migrateUrl(url) ?? url,
                resourceLocalChanges(
                    resourceChanges.state,
                    resourceChanges.operations?.map((operationUrl) => migrateUrl(operationUrl) ?? operationUrl),
                ),
            ]),
        ),
    };
}
