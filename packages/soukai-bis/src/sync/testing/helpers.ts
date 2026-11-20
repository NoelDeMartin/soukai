import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import type { ListenersManager } from '@noeldemartin/utils';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type { FilePushedEvent, SyncJobListener, SyncJobResult } from 'soukai-bis/jobs/sync/SyncJob';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';
import { newModelContainerUrls } from 'soukai-bis/sync/concerns/container-urls';
import Sync from 'soukai-bis/sync/Sync';
import type { ModelContainerUrls, SyncProperties, SyncSession } from 'soukai-bis/sync/Sync';
import Post from 'soukai-bis/testing/stubs/Post';
import { vi } from 'vite-plus/test';

export let properties: Partial<SyncProperties> = {};
export let discoveryUrls = new Map<ModelConstructor, string[]>();

export const user: CompleteSolidUserProfile = {
    webId: 'https://alice.example/profile/card#me',
    shallow: false,
    cloakedDocumentUrls: [],
    publicTypeIndexUrls: [],
    privateTypeIndexUrls: [],
    storageUrls: ['https://alice.example/'],
    writableProfileUrl: 'https://alice.example/profile/card',
};

export function typeIndexWithRegistrations(registrations: [ModelConstructor, string][] = []): ModelWithUrl<TypeIndex> {
    const typeIndex = new TypeIndex({ url: 'https://alice.example/settings/privateTypeIndex' }, { exists: true });

    typeIndex.relatedRegistrations.related = registrations.map(
        ([modelClass, instanceContainer]) =>
            new TypeRegistration({
                forClass: modelClass.getRDFClasses(),
                instanceContainer,
            }),
    );

    return typeIndex as ModelWithUrl<TypeIndex>;
}

export function postContainerUrls(containerUrls: Partial<ModelContainerUrls> = {}): ModelContainerUrls {
    return { ...newModelContainerUrls('https://alice.example/posts/'), ...containerUrls };
}

export function typeIndexes(registrations: [ModelConstructor, string][] = []): SyncSession['findTypeIndexes'] {
    return async () => ({ publicTypeIndexes: [], privateTypeIndexes: [typeIndexWithRegistrations(registrations)] });
}

export async function connect(session: Partial<SyncSession> = {}): Promise<void> {
    properties = {};
    discoveryUrls = new Map();

    await Sync.connect({
        userProfile: user,
        online: true,
        autoPush: false,
        onContainersUpdated: (modelClass, urls) => discoveryUrls.set(modelClass, urls),
        ...session,
        onUpdated: (changes) => {
            properties = { ...properties, ...changes };

            return session.onUpdated?.(changes);
        },
    });
}

export function fakeSyncJob(
    options: {
        createdTypeIndex?: TypeIndex;
        failedRegistrations?: ModelConstructor[];
        failedExternalSources?: [ExternalSource, unknown][];
        onRun?: (job: SyncJob) => unknown;
        pushedFiles?: FilePushedEvent[];
        syncedFileUrls?: string[];
    } = {},
): void {
    vi.spyOn(SyncJob.prototype as unknown as { run(): Promise<SyncJobResult> }, 'run').mockImplementation(
        async function (this: SyncJob) {
            const { _listeners: listeners } = this as unknown as { _listeners: ListenersManager<SyncJobListener> };

            await options.onRun?.(this);

            if (options.createdTypeIndex) {
                await listeners.emit('onModelsRegistered', {
                    typeIndex: options.createdTypeIndex,
                    models: [Post],
                    mode: 'container',
                });
            }

            if (options.failedRegistrations) {
                await listeners.emit('onModelsRegistrationFailed', {
                    models: options.failedRegistrations,
                    error: new Error('Registration failed'),
                    mode: 'container',
                });
            }

            for (const [source, error] of options.failedExternalSources ?? []) {
                await listeners.emit('onExternalSourceFailed', source, error);
            }

            for (const pushedFile of options.pushedFiles ?? []) {
                this.syncedFileUrls.add(pushedFile.url);

                await listeners.emit('onFilePushed', pushedFile);
            }

            for (const url of options.syncedFileUrls ?? []) {
                this.syncedFileUrls.add(url);
            }

            return { syncedDocumentUrls: new Set(), documentsWithErrors: new Set(), syncedFileUrls: new Set() };
        },
    );
}
