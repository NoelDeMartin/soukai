import { invade } from '@noeldemartin/utils';
import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import type { SyncService } from 'soukai-bis/sync/Sync';

function invaded(sync: SyncService) {
    return invade(sync, [
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

function shouldPushLocalChanges(sync: SyncService, changesets: LocalChangeset[]): boolean {
    const { autoPush, previousSyncPendingChangesets } = invaded(sync);

    return (
        autoPush &&
        sync.setupCompleted &&
        !sync.syncing &&
        changesets.length > 0 &&
        !haveSameChangesets(changesets, previousSyncPendingChangesets)
    );
}

export async function updateLocalChanges(sync: SyncService): Promise<void> {
    if (!sync.connected) {
        return;
    }

    const changesets = await requireLocalEngine().getLocalChangesets();

    if (!sync.connected) {
        return;
    }

    invaded(sync)._localChangesCount = changesets.length;

    await invaded(sync).emit('onUpdated', { localChangesCount: changesets.length });

    if (!shouldPushLocalChanges(sync, changesets)) {
        return;
    }

    invaded(sync).pushLocalChanges();
}
