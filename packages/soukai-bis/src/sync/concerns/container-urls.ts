import { arrayUnique, invade, objectFromEntries } from '@noeldemartin/utils';
import { getSyncModelRemoteContainerUrl } from 'soukai-bis/jobs/sync/SyncJob';
import type { SyncApplicationModel } from 'soukai-bis/jobs/sync/SyncJob';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type { SyncService } from 'soukai-bis/sync/Sync';

export interface ModelContainerUrls {
    default: string;
    registered: string[];
    unlisted: string[];
    instances: string[];
}

function invaded(sync: SyncService) {
    return invade(sync, ['_containerUrls', 'emit', 'getRegisteredModels', 'requireUserProfile']);
}

function pickDefaultContainerUrl(
    sync: SyncService,
    syncModel: SyncApplicationModel,
    registeredContainerUrls: string[],
    keepCurrent: boolean,
): string {
    const currentContainerUrl = sync.containerUrls[syncModel.model.modelName]?.default;

    if (
        currentContainerUrl &&
        (keepCurrent || registeredContainerUrls.length === 0 || registeredContainerUrls.includes(currentContainerUrl))
    ) {
        return currentContainerUrl;
    }

    return registeredContainerUrls[0] ?? getDefaultRemoteContainerUrl(sync, syncModel);
}

export function newModelContainerUrls(defaultContainerUrl: string): ModelContainerUrls {
    return { default: defaultContainerUrl, registered: [], unlisted: [], instances: [] };
}

export function getDiscoveryUrls(containerUrls: ModelContainerUrls): string[] {
    return arrayUnique([
        containerUrls.default,
        ...containerUrls.instances,
        ...containerUrls.registered,
        ...containerUrls.unlisted,
    ]);
}

export function getDefaultRemoteContainerUrl(sync: SyncService, syncModel: SyncApplicationModel): string {
    return getSyncModelRemoteContainerUrl(syncModel, invaded(sync).requireUserProfile());
}

export function findContainerUrls(
    sync: SyncService,
    typeIndexes: TypeIndex[],
    keepDefaults: Set<ModelConstructor> = new Set(),
): Record<string, ModelContainerUrls> {
    const registrations = typeIndexes.flatMap((typeIndex) => typeIndex.registrations ?? []);

    return objectFromEntries(
        invaded(sync)
            .getRegisteredModels()
            .map((syncModel) => {
                const modelClass = syncModel.model;
                const typeRegistrations = registrations.filter((registration) => registration.registers(modelClass));
                const registeredContainerUrls = arrayUnique(
                    typeRegistrations
                        .filter((registration) => registration.registersContainer())
                        .map((registration) => registration.instanceContainer),
                );
                const registeredInstanceUrls = arrayUnique(
                    typeRegistrations
                        .filter((registration) => registration.registersInstance())
                        .map((registration) => registration.instance),
                );
                const defaultContainerUrl = pickDefaultContainerUrl(
                    sync,
                    syncModel,
                    registeredContainerUrls,
                    keepDefaults.has(modelClass),
                );
                const unlistedContainerUrls = (sync.containerUrls[modelClass.modelName]?.unlisted ?? []).filter(
                    (containerUrl) =>
                        containerUrl !== defaultContainerUrl && !registeredContainerUrls.includes(containerUrl),
                );

                return [
                    modelClass.modelName,
                    {
                        default: defaultContainerUrl,
                        registered: registeredContainerUrls,
                        unlisted: unlistedContainerUrls,
                        instances: registeredInstanceUrls,
                    },
                ];
            }),
    );
}

function findUnlistedContainerUrls(sync: SyncService, model: Model): ModelContainerUrls | null {
    const modelClass = model.static();
    const containerUrl = model.getContainerUrl();
    const containerUrls =
        sync.containerUrls[modelClass.modelName] ?? newModelContainerUrls(modelClass.defaultContainerUrl);

    if (
        !containerUrl ||
        sync.isInExternalSource(model.requireUrl()) ||
        containerUrls.instances.includes(model.requireUrl()) ||
        !invaded(sync)
            .getRegisteredModels()
            .some((syncModel) => syncModel.model === modelClass) ||
        getDiscoveryUrls(containerUrls).includes(containerUrl)
    ) {
        return null;
    }

    return { ...containerUrls, unlisted: [...containerUrls.unlisted, containerUrl] };
}

export async function setContainerUrls(
    sync: SyncService,
    containerUrls: Record<string, ModelContainerUrls>,
): Promise<void> {
    if (!sync.connected) {
        return;
    }

    invaded(sync)._containerUrls = { ...sync.containerUrls, ...containerUrls };

    for (const { model } of invaded(sync).getRegisteredModels()) {
        const modelContainerUrls = containerUrls[model.modelName];

        if (!modelContainerUrls) {
            continue;
        }

        model.defaultContainerUrl = modelContainerUrls.default;

        await invaded(sync).emit('onContainersUpdated', model, getDiscoveryUrls(modelContainerUrls));
    }

    await invaded(sync).emit('onUpdated', { containerUrls: sync.containerUrls });
}

export async function initializeContainerUrls(sync: SyncService, syncModel: SyncApplicationModel): Promise<void> {
    if (!sync.connected) {
        return;
    }

    const containerUrls = sync.containerUrls[syncModel.model.modelName];

    if (containerUrls) {
        if (sync.setupCompleted) {
            syncModel.model.defaultContainerUrl = containerUrls.default;
        }

        await invaded(sync).emit('onContainersUpdated', syncModel.model, getDiscoveryUrls(containerUrls));

        return;
    }

    if (!sync.setupCompleted) {
        return;
    }

    await setContainerUrls(sync, {
        [syncModel.model.modelName]: newModelContainerUrls(getDefaultRemoteContainerUrl(sync, syncModel)),
    });
}

export async function trackUnlistedContainerUrls(sync: SyncService, model: Model): Promise<void> {
    if (!model.url) {
        return;
    }

    const containerUrls = findUnlistedContainerUrls(sync, model);

    if (!containerUrls) {
        return;
    }

    await setContainerUrls(sync, { [model.static().modelName]: containerUrls });
}
