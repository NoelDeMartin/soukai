import { invade, objectFromEntries, required } from '@noeldemartin/utils';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import MigrateLocalUrlsJob from 'soukai-bis/jobs/migrate-local-urls/MigrateLocalUrlsJob';
import { dispatch } from 'soukai-bis/jobs/utils';
import { isLocalUrl } from 'soukai-bis/lib/urls';
import type { SyncService } from 'soukai-bis/sync/Sync';

import { findContainerUrls, initializeContainerUrls, setContainerUrls } from './container-urls';
import type { ModelContainerUrls } from './container-urls';
import { findTypeIndexes } from './sync';

function invaded(sync: SyncService) {
    return invade(sync, ['_setupCompleted', 'emit', 'getRegisteredModels']);
}

async function migrateLocalUrls(sync: SyncService, containerUrls: Record<string, ModelContainerUrls>): Promise<void> {
    const migrations = objectFromEntries(
        invaded(sync)
            .getRegisteredModels()
            .filter(({ model }) => isLocalUrl(model.defaultContainerUrl))
            .map(({ model }) => [model.defaultContainerUrl, required(containerUrls[model.modelName]).default]),
    );

    if (Object.keys(migrations).length === 0) {
        return;
    }

    await dispatch(new MigrateLocalUrlsJob({ migrations }));
}

async function completeSetup(sync: SyncService): Promise<void> {
    if (!sync.connected || sync.setupCompleted) {
        return;
    }

    invaded(sync)._setupCompleted = true;

    await invaded(sync).emit('onUpdated', { setupCompleted: true });

    for (const syncModel of invaded(sync).getRegisteredModels()) {
        if (sync.containerUrls[syncModel.model.modelName]) {
            continue;
        }

        await initializeContainerUrls(sync, syncModel);
    }
}

export async function isSetupCompleted(): Promise<boolean> {
    const containerUrls = await requireLocalEngine().getContainerUrls();

    return !containerUrls.some(isLocalUrl);
}

export async function runSetup(sync: SyncService): Promise<void> {
    const { publicTypeIndexes, privateTypeIndexes } = await findTypeIndexes(sync);

    if (!sync.connected) {
        return;
    }

    const containerUrls = findContainerUrls(sync, [...publicTypeIndexes, ...privateTypeIndexes]);

    await migrateLocalUrls(sync, containerUrls);
    await setContainerUrls(sync, containerUrls);
    await completeSetup(sync);
}
