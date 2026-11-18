import type { SolidDocument } from '@noeldemartin/solid-utils';
import { arrayUnique } from '@noeldemartin/utils';
import { getResourceOperationUrls } from 'soukai-bis/models/concerns/crdts';

import type { DocumentLocalChanges, ResourceLocalChanges, ResourceLocalState } from './LocalEngine';

const STATE_PRIORITIES: Record<ResourceLocalState, number> = { updated: 1, created: 2, deleted: 3 };

function getNewOperations(changes: ResourceLocalChanges | undefined): string[] {
    return changes && changes.state !== 'deleted' ? (changes.newOperations ?? []) : [];
}

function getDeletedOperations(changes: ResourceLocalChanges | undefined): string[] {
    return changes?.state === 'deleted' ? (changes.deletedOperations ?? []) : [];
}

function cloneLocalChanges(changes: DocumentLocalChanges | null | undefined): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes?.resources ?? {}).map(([url, resourceChanges]) => [
                url,
                resourceLocalChanges(
                    resourceChanges.state,
                    getNewOperations(resourceChanges),
                    getDeletedOperations(resourceChanges),
                ),
            ]),
        ),
    };
}

export function resourceLocalChanges(
    state: ResourceLocalState,
    newOperations: string[] = [],
    deletedOperations: string[] = [],
): ResourceLocalChanges {
    if (state === 'deleted') {
        return deletedOperations.length > 0 ? { state, deletedOperations } : { state };
    }

    return newOperations.length > 0 ? { state, newOperations } : { state };
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
            arrayUnique([...getNewOperations(resourceChanges), ...getNewOperations(otherChanges)]),
            arrayUnique([...getDeletedOperations(resourceChanges), ...getDeletedOperations(otherChanges)]),
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

        const subtractedOperations = getNewOperations(subtractedChanges);
        const newOperations = getNewOperations(resourceChanges).filter(
            (operationUrl) => !subtractedOperations.includes(operationUrl),
        );

        if (subtractedChanges.state !== resourceChanges.state) {
            remaining.resources[url] = resourceLocalChanges(
                resourceChanges.state,
                newOperations,
                getDeletedOperations(resourceChanges),
            );

            continue;
        }

        if (newOperations.length === 0) {
            delete remaining.resources[url];

            continue;
        }

        remaining.resources[url] = resourceLocalChanges('updated', newOperations);
    }

    return remaining;
}

export function clearPushedLocalChanges(
    changes: DocumentLocalChanges | null | undefined,
    pushed: DocumentLocalChanges,
    pushedDocument: SolidDocument,
): DocumentLocalChanges {
    const remaining = subtractLocalChanges(changes, pushed);

    for (const [url, pushedChanges] of Object.entries(pushed.resources)) {
        if (pushedChanges.state === 'created' && !changes?.resources[url]) {
            remaining.resources[url] = resourceLocalChanges(
                'deleted',
                [],
                getResourceOperationUrls(pushedDocument, url),
            );
        }
    }

    return remaining;
}

export function withCreatedAsUpdated(changes: DocumentLocalChanges): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes.resources).map(([url, resourceChanges]) => [
                url,
                resourceChanges.state === 'created'
                    ? resourceLocalChanges('updated', getNewOperations(resourceChanges))
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
    const migrateUrls = (urls: string[]) => urls.map((url) => migrateUrl(url) ?? url);

    return {
        resources: Object.fromEntries(
            Object.entries(changes.resources).map(([url, resourceChanges]) => [
                migrateUrl(url) ?? url,
                resourceLocalChanges(
                    resourceChanges.state,
                    migrateUrls(getNewOperations(resourceChanges)),
                    migrateUrls(getDeletedOperations(resourceChanges)),
                ),
            ]),
        ),
    };
}

export function withoutResourceLocalChanges(changes: DocumentLocalChanges, urls: Set<string>): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(Object.entries(changes.resources).filter(([url]) => !urls.has(url))),
    };
}
