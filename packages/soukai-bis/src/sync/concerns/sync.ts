import { invade } from '@noeldemartin/utils';
import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type { SyncJobConfig } from 'soukai-bis/jobs/sync/SyncJob';
import { dispatch } from 'soukai-bis/jobs/utils';
import Person from 'soukai-bis/models/identity/Person';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type SyncSession from 'soukai-bis/sync/SyncSession';

import { findContainerUrls, setContainerUrls } from './container-urls';
import { haveSameChangesets } from './local-changes';

const MAX_JOBS_PER_SYNC = 3;

export interface SyncTypeIndexes {
    publicTypeIndexes: TypeIndex[];
    privateTypeIndexes: TypeIndex[];
}

interface JobsResult {
    cancelled: boolean;
    pendingChangesets: LocalChangeset[];
    typeIndexes: TypeIndex[];
    modelsWithFailedRegistration: Set<ModelConstructor>;
}

function invaded(session: SyncSession) {
    return invade(session, [
        '_error',
        '_syncing',
        '_activeJob',
        'emit',
        'models',
        'previousSyncPendingChangesets',
        'pushLocalChanges',
        'config',
        'profileManager',
        'service',
    ]);
}

function getJobConfig(session: SyncSession, typeIndexes: SyncTypeIndexes): SyncJobConfig {
    const { config, profileManager, models } = invaded(session);

    return {
        ...typeIndexes,
        externalSources: invaded(session).service.externalSources,
        userProfile: profileManager.getProfile(),
        createPublicTypeIndex: profileManager.createPublicTypeIndex?.bind(profileManager),
        createPrivateTypeIndex: profileManager.createPrivateTypeIndex?.bind(profileManager),
        resolveDeletionConflict: config.resolveDeletionConflict?.bind(config),
        resolveFileConflict: config.resolveFileConflict?.bind(config),
        applicationModels: models,
    };
}

async function runJob(
    session: SyncSession,
    job: SyncJob,
    result: Pick<JobsResult, 'typeIndexes' | 'modelsWithFailedRegistration'>,
): Promise<void> {
    const pushedFileUrls = new Set<string>();

    job.listeners.add({
        onModelsRegistered: (event) => {
            result.typeIndexes.includes(event.typeIndex) || result.typeIndexes.push(event.typeIndex);

            return invaded(session).emit('onModelsRegistered', event);
        },
        onModelsRegistrationFailed: (event) => {
            event.models.forEach((modelClass) => result.modelsWithFailedRegistration.add(modelClass));

            return invaded(session).emit('onModelsRegistrationFailed', event);
        },
        onExternalSourceFailed: (source, error) => invaded(session).emit('onExternalSourceFailed', source, error),
        onProfileUpdated: (profile) => invaded(session).profileManager.onProfileUpdated?.(profile),
        onFilePushed: (event) => {
            pushedFileUrls.add(event.url);

            return invaded(session).emit('onFilePushed', event);
        },
    });

    try {
        await dispatch(job);
    } finally {
        for (const url of job.syncedFileUrls) {
            if (pushedFileUrls.has(url)) {
                continue;
            }

            await invaded(session).emit('onFileUpdated', url);
        }
    }
}

export async function findTypeIndexes(session: SyncSession): Promise<SyncTypeIndexes> {
    const { profileManager } = invaded(session);

    if (profileManager.findTypeIndexes) {
        return profileManager.findTypeIndexes();
    }

    const person = Person.createFromProfile(profileManager.getProfile());
    const [publicTypeIndexes, privateTypeIndexes] = await Promise.all([
        person.findPublicTypeIndexes(),
        person.findPrivateTypeIndexes(),
    ]);

    return { publicTypeIndexes, privateTypeIndexes };
}

async function setActiveJob(session: SyncSession, job: SyncJob | null): Promise<void> {
    invaded(session)._activeJob = job;

    await invaded(session).emit('onUpdated', { activeJob: job });
}

async function runJobs(session: SyncSession): Promise<JobsResult> {
    const result: JobsResult = {
        cancelled: false,
        pendingChangesets: await requireLocalEngine().getLocalChangesets(),
        typeIndexes: [],
        modelsWithFailedRegistration: new Set(),
    };
    let jobs = 0;
    let previousChangesets: LocalChangeset[] = [];

    do {
        const typeIndexes = await findTypeIndexes(session);

        if (!session.isActive()) {
            return { ...result, cancelled: true, pendingChangesets: await requireLocalEngine().getLocalChangesets() };
        }

        const job = new SyncJob(getJobConfig(session, typeIndexes));

        result.typeIndexes = [...typeIndexes.publicTypeIndexes, ...typeIndexes.privateTypeIndexes];
        result.modelsWithFailedRegistration = new Set();
        await setActiveJob(session, job);
        await runJob(session, job, result);

        if (job.cancelled) {
            return { ...result, cancelled: true, pendingChangesets: await requireLocalEngine().getLocalChangesets() };
        }

        await setActiveJob(session, null);

        previousChangesets = result.pendingChangesets;
        result.pendingChangesets = await requireLocalEngine().getLocalChangesets();

        jobs++;
    } while (
        result.pendingChangesets.length > 0 &&
        !haveSameChangesets(result.pendingChangesets, previousChangesets) &&
        jobs < MAX_JOBS_PER_SYNC
    );

    return result;
}

export async function runSync(session: SyncSession): Promise<void> {
    let cancelled = false;
    let syncError: unknown = null;

    invaded(session).pushLocalChanges.cancel();
    invaded(session)._syncing = true;
    invaded(session)._error = null;

    await invaded(session).emit('onUpdated', { syncing: true, error: null });

    try {
        await invaded(session).emit('onSyncStarted');

        const result = await runJobs(session);

        invaded(session).previousSyncPendingChangesets = result.pendingChangesets;
        cancelled = result.cancelled;

        if (cancelled) {
            return;
        }

        await setContainerUrls(
            session,
            findContainerUrls(session, result.typeIndexes, result.modelsWithFailedRegistration),
        );
    } catch (error) {
        syncError = error;
        invaded(session).previousSyncPendingChangesets = await requireLocalEngine().getLocalChangesets();
        invaded(session)._error = error;

        await invaded(session).emit('onUpdated', { error });
        await invaded(session).emit('onSyncFailed', error);
    } finally {
        invaded(session)._syncing = false;

        await invaded(session).emit('onUpdated', { syncing: false });

        if (session.activeJob) {
            await setActiveJob(session, null);
        }

        await session.refreshLocalChanges();
        await invaded(session).emit('onSyncCompleted', { cancelled, error: syncError });
    }
}
