import { invade, objectFromEntries, required } from '@noeldemartin/utils';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import MigrateLocalUrlsJob from 'soukai-bis/jobs/migrate-local-urls/MigrateLocalUrlsJob';
import { dispatch } from 'soukai-bis/jobs/utils';
import { isLocalUrl } from 'soukai-bis/lib/urls';
import type SyncSession from 'soukai-bis/sync/SyncSession';

import { findContainerUrls, initializeContainerUrls, setContainerUrls } from './container-urls';
import type { ModelContainerUrls } from './container-urls';
import { findTypeIndexes } from './sync';

function invaded(session: SyncSession) {
    return invade(session, ['getRegisteredModels', 'service']);
}

async function migrateLocalUrls(
    session: SyncSession,
    containerUrls: Record<string, ModelContainerUrls>,
): Promise<void> {
    const migrations = objectFromEntries(
        invaded(session)
            .getRegisteredModels()
            .filter(({ model }) => isLocalUrl(model.defaultContainerUrl))
            .map(({ model }) => [model.defaultContainerUrl, required(containerUrls[model.modelName]).default]),
    );

    if (Object.keys(migrations).length === 0) {
        return;
    }

    await dispatch(new MigrateLocalUrlsJob({ migrations }));
}

async function completeSetup(session: SyncSession): Promise<void> {
    const service = invaded(session).service;

    if (!session.isActive() || service.setupCompleted) {
        return;
    }

    await invade(service, ['completeSetup']).completeSetup();

    for (const syncModel of invaded(session).getRegisteredModels()) {
        if (service.containerUrls[syncModel.model.modelName]) {
            continue;
        }

        await initializeContainerUrls(session, syncModel);
    }
}

export async function isSetupCompleted(): Promise<boolean> {
    const containerUrls = await requireLocalEngine().getContainerUrls();

    return !containerUrls.some(isLocalUrl);
}

export async function runSetup(session: SyncSession): Promise<void> {
    const { publicTypeIndexes, privateTypeIndexes } = await findTypeIndexes(session);

    if (!session.isActive()) {
        return;
    }

    const containerUrls = findContainerUrls(session, [...publicTypeIndexes, ...privateTypeIndexes]);

    await migrateLocalUrls(session, containerUrls);
    await setContainerUrls(session, containerUrls);
    await completeSetup(session);
}
