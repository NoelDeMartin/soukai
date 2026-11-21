import { invade } from '@noeldemartin/utils';
import { deleteExternalSourceData, getExternalSourceUrl } from 'soukai-bis/jobs/sync/external-sources';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type SyncSession from 'soukai-bis/sync/SyncSession';

function invaded(session: SyncSession) {
    return invade(session, ['_externalSources', 'emit']);
}

export async function discardExternalSource(session: SyncSession, source: ExternalSource): Promise<void> {
    const sourceUrl = getExternalSourceUrl(source);

    invaded(session)._externalSources = session.externalSources.filter(
        (externalSource) => getExternalSourceUrl(externalSource) !== sourceUrl,
    );

    await invaded(session).emit('onUpdated', { externalSources: session.externalSources });
    await deleteExternalSourceData(source);
    await session.refreshLocalChanges();
}
