import { invade } from '@noeldemartin/utils';
import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type { SyncJobConfig } from 'soukai-bis/jobs/sync/SyncJob';
import { dispatch } from 'soukai-bis/jobs/utils';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type { SyncService } from 'soukai-bis/sync/Sync';

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

function invaded(sync: SyncService) {
    return invade(sync, [
        '_error',
        '_syncing',
        '_activeJob',
        'emit',
        'models',
        'previousSyncPendingChangesets',
        'pushLocalChanges',
        'requireSession',
        'requireUserProfile',
    ]);
}

function getJobConfig(sync: SyncService, typeIndexes: SyncTypeIndexes): SyncJobConfig {
    const session = invaded(sync).requireSession();

    return {
        ...typeIndexes,
        externalSources: sync.externalSources,
        userProfile: invaded(sync).requireUserProfile(),
        createPublicTypeIndex: session.createPublicTypeIndex?.bind(session),
        createPrivateTypeIndex: session.createPrivateTypeIndex?.bind(session),
        resolveDeletionConflict: session.resolveDeletionConflict?.bind(session),
        resolveFileConflict: session.resolveFileConflict?.bind(session),
        applicationModels: invaded(sync).models,
    };
}

async function runJob(
    sync: SyncService,
    job: SyncJob,
    result: Pick<JobsResult, 'typeIndexes' | 'modelsWithFailedRegistration'>,
): Promise<void> {
    const pushedFileUrls = new Set<string>();

    job.listeners.add({
        onModelsRegistered: (event) => {
            result.typeIndexes.includes(event.typeIndex) || result.typeIndexes.push(event.typeIndex);

            return invaded(sync).emit('onModelsRegistered', event);
        },
        onModelsRegistrationFailed: (event) => {
            event.models.forEach((modelClass) => result.modelsWithFailedRegistration.add(modelClass));

            return invaded(sync).emit('onModelsRegistrationFailed', event);
        },
        onExternalSourceFailed: (source, error) => invaded(sync).emit('onExternalSourceFailed', source, error),
        onFilePushed: (event) => {
            pushedFileUrls.add(event.url);

            return invaded(sync).emit('onFilePushed', event);
        },
    });

    try {
        await dispatch(job);
    } finally {
        for (const url of job.syncedFileUrls) {
            if (pushedFileUrls.has(url)) {
                continue;
            }

            await invaded(sync).emit('onFileUpdated', url);
        }
    }
}

export async function findTypeIndexes(sync: SyncService): Promise<SyncTypeIndexes> {
    return (
        (await invaded(sync).requireSession().findTypeIndexes?.()) ?? {
            publicTypeIndexes: [],
            privateTypeIndexes: [],
        }
    );
}

async function setActiveJob(sync: SyncService, job: SyncJob | null): Promise<void> {
    invaded(sync)._activeJob = job;

    await invaded(sync).emit('onUpdated', { activeJob: job });
}

async function runJobs(sync: SyncService): Promise<JobsResult> {
    const result: JobsResult = {
        cancelled: false,
        pendingChangesets: await requireLocalEngine().getLocalChangesets(),
        typeIndexes: [],
        modelsWithFailedRegistration: new Set(),
    };
    let jobs = 0;
    let previousChangesets: LocalChangeset[] = [];

    do {
        const typeIndexes = await findTypeIndexes(sync);

        if (!sync.connected) {
            return { ...result, cancelled: true, pendingChangesets: await requireLocalEngine().getLocalChangesets() };
        }

        const job = new SyncJob(getJobConfig(sync, typeIndexes));

        result.typeIndexes = [...typeIndexes.publicTypeIndexes, ...typeIndexes.privateTypeIndexes];
        result.modelsWithFailedRegistration = new Set();
        await setActiveJob(sync, job);
        await runJob(sync, job, result);

        if (job.cancelled) {
            return { ...result, cancelled: true, pendingChangesets: await requireLocalEngine().getLocalChangesets() };
        }

        await setActiveJob(sync, null);

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

export async function runSync(sync: SyncService): Promise<void> {
    let cancelled = false;
    let syncError: unknown = null;

    invaded(sync).pushLocalChanges.cancel();
    invaded(sync)._syncing = true;
    invaded(sync)._error = null;

    await invaded(sync).emit('onUpdated', { syncing: true, error: null });

    try {
        await invaded(sync).emit('onSyncStarted');

        const result = await runJobs(sync);

        invaded(sync).previousSyncPendingChangesets = result.pendingChangesets;
        cancelled = result.cancelled;

        if (cancelled) {
            return;
        }

        await setContainerUrls(sync, findContainerUrls(sync, result.typeIndexes, result.modelsWithFailedRegistration));
    } catch (error) {
        syncError = error;
        invaded(sync).previousSyncPendingChangesets = await requireLocalEngine().getLocalChangesets();
        invaded(sync)._error = error;

        await invaded(sync).emit('onUpdated', { error });
        await invaded(sync).emit('onSyncFailed', error);
    } finally {
        invaded(sync)._syncing = false;

        await invaded(sync).emit('onUpdated', { syncing: false });

        if (sync.activeJob) {
            await setActiveJob(sync, null);
        }

        await sync.refreshLocalChanges();
        await invaded(sync).emit('onSyncCompleted', { cancelled, error: syncError });
    }
}
