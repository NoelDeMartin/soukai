import { invade } from '@noeldemartin/utils';
import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import type SyncSession from 'soukai-bis/sync/SyncSession';

function invaded(session: SyncSession) {
    return invade(session, [
        '_localChangesCount',
        'autoPush',
        'emit',
        'previousSyncPendingChangesets',
        'pushLocalChanges',
    ]);
}

export function haveSameChangesets(changesets: LocalChangeset[], otherChangesets: LocalChangeset[]): boolean {
    return (
        changesets.length === otherChangesets.length &&
        changesets.every((changeset, index) => changeset.date.getTime() === otherChangesets[index]?.date.getTime())
    );
}

function shouldPushLocalChanges(session: SyncSession, changesets: LocalChangeset[]): boolean {
    const { autoPush, previousSyncPendingChangesets } = invaded(session);

    return (
        autoPush &&
        session.setupCompleted &&
        !session.syncing &&
        changesets.length > 0 &&
        !haveSameChangesets(changesets, previousSyncPendingChangesets)
    );
}

export async function updateLocalChanges(session: SyncSession): Promise<void> {
    if (!session.isActive()) {
        return;
    }

    const changesets = await requireLocalEngine().getLocalChangesets();

    if (!session.isActive()) {
        return;
    }

    invaded(session)._localChangesCount = changesets.length;

    await invaded(session).emit('onUpdated', { localChangesCount: changesets.length });

    if (!shouldPushLocalChanges(session, changesets)) {
        return;
    }

    invaded(session).pushLocalChanges();
}
