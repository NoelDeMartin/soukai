import { escapeRegexText, invade, silenced } from '@noeldemartin/utils';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import { getExternalSourceUrl } from 'soukai-bis/jobs/sync/external-sources';
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

    if (source.containerUrl !== undefined) {
        await requireLocalEngine().dropContainers(new RegExp(`^${escapeRegexText(source.containerUrl)}`));
    } else {
        await silenced(requireLocalEngine().deleteDocument(sourceUrl), { ignore: DocumentNotFound });
    }

    await sync.refreshLocalChanges();
}
