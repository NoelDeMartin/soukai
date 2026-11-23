import { invade } from '@noeldemartin/utils';
import { deleteExternalSourceData, getExternalSourceUrl } from 'soukai-bis/jobs/sync/external-sources';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { SyncService } from 'soukai-bis/sync/Sync';

export async function discardExternalSource(sync: SyncService, source: ExternalSource): Promise<void> {
    const sourceUrl = getExternalSourceUrl(source);

    await invade(sync, ['updateExternalSources']).updateExternalSources(
        sync.externalSources.filter((externalSource) => getExternalSourceUrl(externalSource) !== sourceUrl),
    );
    await deleteExternalSourceData(source);
    await sync.session?.refreshLocalChanges();
}
