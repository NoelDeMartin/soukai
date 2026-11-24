import { invade, objectFromEntries, required } from '@noeldemartin/utils';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import MigrateLocalUrlsJob from 'soukai-bis/jobs/migrate-local-urls/MigrateLocalUrlsJob';
import type { MigrateLocalUrlsJobConfig } from 'soukai-bis/jobs/migrate-local-urls/MigrateLocalUrlsJob';
import { dispatch } from 'soukai-bis/jobs/utils';
import { isLocalUrl } from 'soukai-bis/lib/urls';
import type SyncSession from 'soukai-bis/sync/SyncSession';

import { findContainerUrls, initializeContainerUrls, setContainerUrls } from './container-urls';
import type { ModelContainerUrls } from './container-urls';
import { findTypeIndexes } from './sync';

export type SetupOptions = MigrateLocalUrlsJobConfig;

function invaded(session: SyncSession) {
    return invade(session, ['getRegisteredModels', 'service']);
}

function applyCustomMigrations(
    session: SyncSession,
    containerUrls: Record<string, ModelContainerUrls>,
    migrations: Record<string, string> = {},
): Record<string, ModelContainerUrls> {
    const customContainerUrls = { ...containerUrls };

    for (const { model } of invaded(session).getRegisteredModels()) {
        const customContainerUrl = migrations[model.defaultContainerUrl];
        const modelContainerUrls = customContainerUrls[model.modelName];

        if (!isLocalUrl(model.defaultContainerUrl) || !customContainerUrl || !modelContainerUrls) {
            continue;
        }

        customContainerUrls[model.modelName] = { ...modelContainerUrls, default: customContainerUrl };
    }

    return customContainerUrls;
}

async function migrateLocalUrls(
    session: SyncSession,
    containerUrls: Record<string, ModelContainerUrls>,
    options: SetupOptions,
): Promise<void> {
    const migrations = {
        ...objectFromEntries(
            invaded(session)
                .getRegisteredModels()
                .filter(({ model }) => isLocalUrl(model.defaultContainerUrl))
                .map(({ model }) => [model.defaultContainerUrl, required(containerUrls[model.modelName]).default]),
        ),
        ...options.migrations,
    };

    if (Object.keys(migrations).length === 0 && Object.keys(options.prefixes ?? {}).length === 0) {
        return;
    }

    await dispatch(new MigrateLocalUrlsJob({ ...options, migrations }));
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

export async function requiresSetup(): Promise<boolean> {
    const containerUrls = await requireLocalEngine().getContainerUrls();

    return containerUrls.some(isLocalUrl);
}

export async function autoSetup(session: SyncSession): Promise<void> {
    const service = invaded(session).service;

    if (service.setupCompleted || (await requiresSetup()) || session.disconnecting) {
        return;
    }

    await invade(service, ['completeSetup']).completeSetup();
}

export async function runSetup(session: SyncSession, options: SetupOptions = {}): Promise<void> {
    const { publicTypeIndexes, privateTypeIndexes } = await findTypeIndexes(session);

    if (!session.isActive()) {
        return;
    }

    const containerUrls = applyCustomMigrations(
        session,
        findContainerUrls(session, [...publicTypeIndexes, ...privateTypeIndexes]),
        options.migrations,
    );

    await migrateLocalUrls(session, containerUrls, options);
    await setContainerUrls(session, containerUrls);
    await completeSetup(session);
}
