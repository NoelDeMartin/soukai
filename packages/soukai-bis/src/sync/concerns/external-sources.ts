import { invade } from '@noeldemartin/utils';
import { deleteExternalSourceData, getExternalSourceUrl } from 'soukai-bis/jobs/sync/external-sources';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { SyncService } from 'soukai-bis/sync/Sync';

function invaded(sync: SyncService) {
    return invade(sync, ['_externalSources', 'emit']);
}

export async function discardExternalSource(sync: SyncService, source: ExternalSource): Promise<void> {
    const sourceUrl = getExternalSourceUrl(source);

    invaded(sync)._externalSources = sync.externalSources.filter(
        (externalSource) => getExternalSourceUrl(externalSource) !== sourceUrl,
    );

    await invaded(sync).emit('onUpdated', { externalSources: sync.externalSources });
    await deleteExternalSourceData(source);
    await sync.refreshLocalChanges();
}
