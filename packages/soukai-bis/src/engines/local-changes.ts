import type { SolidDocument } from '@noeldemartin/solid-utils';
import { arrayUnique } from '@noeldemartin/utils';
import { getResourceOperationUrls } from 'soukai-bis/models/concerns/crdts';

import type { DocumentLocalChanges, ResourceLocalChanges } from './LocalEngine';

type ResourceLocalChangesKind = 'created' | 'updated' | 'deleted';

function latestDate(date?: Date, other?: Date): Date | undefined {
    if (!date || !other) {
        return date ?? other;
    }

    return date.getTime() >= other.getTime() ? date : other;
}

function sameDate(date?: Date, other?: Date): boolean {
    return date?.getTime() === other?.getTime();
}

function resourceLocalChangesKind(changes: ResourceLocalChanges): ResourceLocalChangesKind {
    return changes.deletedAt ? 'deleted' : changes.createdAt ? 'created' : 'updated';
}

export function getResourceLocalChangesDate(changes: ResourceLocalChanges): Date | undefined {
    return changes.deletedAt ?? changes.createdAt ?? changes.updatedAt;
}

function resourceLocalChanges(changes: ResourceLocalChanges): ResourceLocalChanges {
    if (changes.deletedAt) {
        return {
            deletedAt: changes.deletedAt,
            ...(changes.deletedOperations?.length && { deletedOperations: changes.deletedOperations.slice(0) }),
        };
    }

    return {
        ...(changes.createdAt && { createdAt: changes.createdAt }),
        ...(!changes.createdAt && changes.updatedAt && { updatedAt: changes.updatedAt }),
        ...(changes.newOperations?.length && { newOperations: changes.newOperations.slice(0) }),
    };
}

function cloneLocalChanges(changes: DocumentLocalChanges | null | undefined): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes?.resources ?? {}).map(([url, resourceChanges]) => [
                url,
                resourceLocalChanges(resourceChanges),
            ]),
        ),
    };
}

export function isCreatedLocalChange(changes: ResourceLocalChanges | null | undefined): boolean {
    return !!changes && resourceLocalChangesKind(changes) === 'created';
}

export function isDeletedLocalChange(changes: ResourceLocalChanges | null | undefined): boolean {
    return !!changes && resourceLocalChangesKind(changes) === 'deleted';
}

export function mergeLocalChanges(
    changes: DocumentLocalChanges | null | undefined,
    other: DocumentLocalChanges | null | undefined,
): DocumentLocalChanges {
    const merged = cloneLocalChanges(changes);

    for (const [url, otherChanges] of Object.entries(other?.resources ?? {})) {
        const resourceChanges = merged.resources[url];

        merged.resources[url] = resourceLocalChanges({
            createdAt: resourceChanges?.createdAt ?? otherChanges.createdAt,
            updatedAt: latestDate(resourceChanges?.updatedAt, otherChanges.updatedAt),
            deletedAt: latestDate(resourceChanges?.deletedAt, otherChanges.deletedAt),
            newOperations: arrayUnique([
                ...(resourceChanges?.newOperations ?? []),
                ...(otherChanges.newOperations ?? []),
            ]),
            deletedOperations: arrayUnique([
                ...(resourceChanges?.deletedOperations ?? []),
                ...(otherChanges.deletedOperations ?? []),
            ]),
        });
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

        const newOperations = (resourceChanges.newOperations ?? []).filter(
            (operationUrl) => !subtractedChanges.newOperations?.includes(operationUrl),
        );

        if (
            resourceLocalChangesKind(subtractedChanges) !== resourceLocalChangesKind(resourceChanges) ||
            !sameDate(getResourceLocalChangesDate(subtractedChanges), getResourceLocalChangesDate(resourceChanges))
        ) {
            remaining.resources[url] = resourceLocalChanges({ ...resourceChanges, newOperations });

            continue;
        }

        if (newOperations.length === 0) {
            delete remaining.resources[url];

            continue;
        }

        remaining.resources[url] = { newOperations };
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
        if (isCreatedLocalChange(pushedChanges) && !changes?.resources[url]) {
            remaining.resources[url] = resourceLocalChanges({
                deletedAt: new Date(),
                deletedOperations: getResourceOperationUrls(pushedDocument, url),
            });
        }
    }

    return remaining;
}

export function withCreatedAsUpdated(changes: DocumentLocalChanges): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(
            Object.entries(changes.resources).map(([url, resourceChanges]) => [
                url,
                isCreatedLocalChange(resourceChanges)
                    ? resourceLocalChanges({
                          updatedAt: resourceChanges.newOperations?.length ? undefined : resourceChanges.createdAt,
                          newOperations: resourceChanges.newOperations,
                      })
                    : resourceChanges,
            ]),
        ),
    };
}

export function getLocallyDeletedResourceUrls(changes: DocumentLocalChanges | null | undefined): Set<string> {
    return new Set(
        Object.entries(changes?.resources ?? {})
            .filter(([_, resourceChanges]) => isDeletedLocalChange(resourceChanges))
            .map(([url]) => url),
    );
}

export function hasLocalDeletions(changes: DocumentLocalChanges | null | undefined): boolean {
    return Object.values(changes?.resources ?? {}).some((resourceChanges) => isDeletedLocalChange(resourceChanges));
}

export function migrateLocalChanges(
    changes: DocumentLocalChanges,
    migrateUrl: (url: string) => string | null,
): DocumentLocalChanges {
    const migrateUrls = (urls?: string[]) => urls?.map((url) => migrateUrl(url) ?? url);

    return {
        resources: Object.fromEntries(
            Object.entries(changes.resources).map(([url, resourceChanges]) => [
                migrateUrl(url) ?? url,
                resourceLocalChanges({
                    ...resourceChanges,
                    newOperations: migrateUrls(resourceChanges.newOperations),
                    deletedOperations: migrateUrls(resourceChanges.deletedOperations),
                }),
            ]),
        ),
    };
}

export function withoutResourceLocalChanges(changes: DocumentLocalChanges, urls: Set<string>): DocumentLocalChanges {
    return {
        resources: Object.fromEntries(Object.entries(changes.resources).filter(([url]) => !urls.has(url))),
    };
}
