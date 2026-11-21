import { arrayUnique, invade, objectFromEntries } from '@noeldemartin/utils';
import { getSyncModelRemoteContainerUrl } from 'soukai-bis/jobs/sync/SyncJob';
import type { SyncApplicationModel } from 'soukai-bis/jobs/sync/SyncJob';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';
import type SyncSession from 'soukai-bis/sync/SyncSession';

export interface ModelContainerUrls {
    default: string;
    registered: string[];
    unlisted: string[];
    instances: string[];
}

function invaded(session: SyncSession) {
    return invade(session, ['_containerUrls', 'emit', 'getRegisteredModels', 'profileManager']);
}

function pickDefaultContainerUrl(
    session: SyncSession,
    syncModel: SyncApplicationModel,
    registeredContainerUrls: string[],
    keepCurrent: boolean,
): string {
    const currentContainerUrl = session.containerUrls[syncModel.model.modelName]?.default;

    if (
        currentContainerUrl &&
        (keepCurrent || registeredContainerUrls.length === 0 || registeredContainerUrls.includes(currentContainerUrl))
    ) {
        return currentContainerUrl;
    }

    return registeredContainerUrls[0] ?? getDefaultRemoteContainerUrl(session, syncModel);
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

export function getDefaultRemoteContainerUrl(session: SyncSession, syncModel: SyncApplicationModel): string {
    return getSyncModelRemoteContainerUrl(syncModel, invaded(session).profileManager.getProfile());
}

export function findContainerUrls(
    session: SyncSession,
    typeIndexes: TypeIndex[],
    keepDefaults: Set<ModelConstructor> = new Set(),
): Record<string, ModelContainerUrls> {
    const registrations = typeIndexes.flatMap((typeIndex) => typeIndex.registrations ?? []);

    return objectFromEntries(
        invaded(session)
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
                    session,
                    syncModel,
                    registeredContainerUrls,
                    keepDefaults.has(modelClass),
                );
                const unlistedContainerUrls = (session.containerUrls[modelClass.modelName]?.unlisted ?? []).filter(
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

function findUnlistedContainerUrls(session: SyncSession, model: Model): ModelContainerUrls | null {
    const modelClass = model.static();
    const containerUrl = model.getContainerUrl();
    const containerUrls =
        session.containerUrls[modelClass.modelName] ?? newModelContainerUrls(modelClass.defaultContainerUrl);

    if (
        !containerUrl ||
        session.isInExternalSource(model.requireUrl()) ||
        containerUrls.instances.includes(model.requireUrl()) ||
        !invaded(session)
            .getRegisteredModels()
            .some((syncModel) => syncModel.model === modelClass) ||
        getDiscoveryUrls(containerUrls).includes(containerUrl)
    ) {
        return null;
    }

    return { ...containerUrls, unlisted: [...containerUrls.unlisted, containerUrl] };
}

export async function setContainerUrls(
    session: SyncSession,
    containerUrls: Record<string, ModelContainerUrls>,
): Promise<void> {
    if (!session.isActive()) {
        return;
    }

    invaded(session)._containerUrls = { ...session.containerUrls, ...containerUrls };

    for (const { model } of invaded(session).getRegisteredModels()) {
        const modelContainerUrls = containerUrls[model.modelName];

        if (!modelContainerUrls) {
            continue;
        }

        model.defaultContainerUrl = modelContainerUrls.default;

        await invaded(session).emit('onContainersUpdated', model, getDiscoveryUrls(modelContainerUrls));
    }

    await invaded(session).emit('onUpdated', { containerUrls: session.containerUrls });
}

export async function initializeContainerUrls(session: SyncSession, syncModel: SyncApplicationModel): Promise<void> {
    if (!session.isActive()) {
        return;
    }

    const containerUrls = session.containerUrls[syncModel.model.modelName];

    if (containerUrls) {
        if (session.setupCompleted) {
            syncModel.model.defaultContainerUrl = containerUrls.default;
        }

        await invaded(session).emit('onContainersUpdated', syncModel.model, getDiscoveryUrls(containerUrls));

        return;
    }

    if (!session.setupCompleted) {
        return;
    }

    await setContainerUrls(session, {
        [syncModel.model.modelName]: newModelContainerUrls(getDefaultRemoteContainerUrl(session, syncModel)),
    });
}

export async function trackUnlistedContainerUrls(session: SyncSession, model: Model): Promise<void> {
    if (!model.url) {
        return;
    }

    const containerUrls = findUnlistedContainerUrls(session, model);

    if (!containerUrls) {
        return;
    }

    await setContainerUrls(session, { [model.static().modelName]: containerUrls });
}
