import { SolidDocumentPermissions } from '@noeldemartin/solid-utils';
import { arrayGroupBy, arrayUnique, urlRoute } from '@noeldemartin/utils';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { safeContainerUrl } from 'soukai-bis/lib/internals/urls';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { TypeIndexRegistration } from 'soukai-bis/models/interop/TypeIndex';
import Container from 'soukai-bis/models/ldp/Container';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

async function makeDocumentPublic(url: string, engine: SolidEngine): Promise<void> {
    const RemoteContainer = class extends Container {};

    RemoteContainer.setEngine(engine);

    await new RemoteContainer({ url }, { exists: true }).updatePublicPermissions([SolidDocumentPermissions.Read]);
}

function getUnregisteredModels(
    container: ModelWithUrl<Container>,
    models: Set<ModelConstructor>,
    registeredContainers: Map<string, Set<ModelConstructor>>,
): ModelConstructor[] {
    const unregisteredModels = new Set<ModelConstructor>(models);
    let containerUrl: string | null = container.url;

    while (containerUrl) {
        registeredContainers.get(containerUrl)?.forEach((model) => unregisteredModels.delete(model));

        containerUrl = safeContainerUrl(containerUrl);

        if (unregisteredModels.size === 0) {
            return [];
        }
    }

    return Array.from(unregisteredModels);
}

function getUnregisteredContainers(
    container: ModelWithUrl<Container>,
    unregisteredModels: ModelConstructor[],
    modelRegistrations: Map<ModelConstructor, ModelRegistration>,
): [ModelWithUrl<Container>, ModelConstructor[]][] {
    const modelsByContainerUrl = {} as Record<string, ModelConstructor[]>;

    for (const model of unregisteredModels) {
        const registrationPath = modelRegistrations.get(model)?.containerUrl;

        if (!registrationPath || !container.url.startsWith(registrationPath)) {
            modelsByContainerUrl[container.url] ??= [];
            modelsByContainerUrl[container.url]?.push(model);

            continue;
        }

        modelsByContainerUrl[registrationPath] ??= [];
        modelsByContainerUrl[registrationPath]?.push(model);
    }

    return Object.entries(modelsByContainerUrl).map(([containerUrl, models]) => [
        new Container({ url: containerUrl }, { exists: true }) as ModelWithUrl<Container>,
        models,
    ]);
}

function removeRegisteredInstance(
    registeredInstances: Map<string, Set<ModelConstructor>>,
    instanceUrl: string,
    model: ModelConstructor,
): void {
    const instanceModels = registeredInstances.get(instanceUrl);

    instanceModels?.delete(model);

    if (instanceModels?.size === 0) {
        registeredInstances.delete(instanceUrl);
    }
}

export type ModelRegistrationMode = 'container' | 'instance';

export interface ModelsRegisteredEvent {
    typeIndex: TypeIndex;
    models: ModelConstructor[];
    mode: ModelRegistrationMode;
}

export interface ModelsRegistrationFailedEvent {
    models: ModelConstructor[];
    error: unknown;
    mode: ModelRegistrationMode;
}

export interface ModelRegistration {
    containerUrl: string;
    visibility: TypeIndexRegistration;
    mode: ModelRegistrationMode;
}

export function addRegisteredModels(
    registry: Map<string, Set<ModelConstructor>>,
    url: string,
    models: ModelConstructor[],
): void {
    if (models.length === 0) {
        return;
    }

    const registeredModels = registry.get(url) ?? new Set();

    models.forEach((model) => registeredModels.add(model));
    registry.set(url, registeredModels);
}

export async function syncContainerRegistration(options: {
    container: ModelWithUrl<Container>;
    models: Set<ModelConstructor>;
    registeredContainers: Map<string, Set<ModelConstructor>>;
    modelRegistrations: Map<ModelConstructor, ModelRegistration>;
    remoteEngine: SolidEngine;
    getTypeIndex: (visibility: TypeIndexRegistration) => Promise<TypeIndex>;
    onModelsRegistered: (event: ModelsRegisteredEvent) => unknown;
    onModelsRegistrationFailed: (event: ModelsRegistrationFailedEvent) => unknown;
}): Promise<void> {
    const unregisteredModels = getUnregisteredModels(options.container, options.models, options.registeredContainers);
    const modelsByVisibility = arrayGroupBy(
        unregisteredModels,
        (model) => options.modelRegistrations.get(model)?.visibility ?? 'private',
    );

    for (const [visibility, models] of Object.entries(modelsByVisibility) as [
        TypeIndexRegistration,
        ModelConstructor[],
    ][]) {
        const registeredModels: ModelConstructor[] = [];
        let typeIndex: TypeIndex | null = null;
        let failure: { error: unknown } | null = null;

        try {
            typeIndex = await options.getTypeIndex(visibility);

            const unregisteredContainers = getUnregisteredContainers(
                options.container,
                models,
                options.modelRegistrations,
            );

            for (const [container, containerModels] of unregisteredContainers) {
                if (visibility === 'public') {
                    await makeDocumentPublic(container.url, options.remoteEngine);
                }

                for (const model of containerModels) {
                    await container.register(typeIndex, model);
                }

                addRegisteredModels(options.registeredContainers, container.url, containerModels);
                registeredModels.push(...containerModels);
            }
        } catch (error) {
            failure = { error };
        }

        if (typeIndex && registeredModels.length > 0) {
            await options.onModelsRegistered({ typeIndex, models: registeredModels, mode: 'container' });
        }

        if (failure) {
            await options.onModelsRegistrationFailed({
                models: models.filter((model) => !registeredModels.includes(model)),
                error: failure.error,
                mode: 'container',
            });
        }
    }
}

export async function syncInstanceRegistration(options: {
    instances: Map<ModelConstructor, string[]>;
    registeredInstances: Map<string, Set<ModelConstructor>>;
    modelRegistrations: Map<ModelConstructor, ModelRegistration>;
    remoteEngine: SolidEngine;
    getTypeIndex: (visibility: TypeIndexRegistration) => Promise<TypeIndex>;
    onModelsRegistered: (event: ModelsRegisteredEvent) => unknown;
    onModelsRegistrationFailed: (event: ModelsRegistrationFailedEvent) => unknown;
}): Promise<void> {
    const pendingInstances: [ModelConstructor, string][] = [];

    for (const [model, instanceUrls] of options.instances) {
        for (const instanceUrl of instanceUrls) {
            if (options.registeredInstances.get(instanceUrl)?.has(model)) {
                continue;
            }

            pendingInstances.push([model, instanceUrl]);
            addRegisteredModels(options.registeredInstances, instanceUrl, [model]);
        }
    }

    const instancesByVisibility = arrayGroupBy(
        pendingInstances,
        ([model]) => options.modelRegistrations.get(model)?.visibility ?? 'private',
    );

    for (const [visibility, instances] of Object.entries(instancesByVisibility) as [
        TypeIndexRegistration,
        [ModelConstructor, string][],
    ][]) {
        const registeredInstances: [ModelConstructor, string][] = [];
        let typeIndex: TypeIndex | null = null;
        let failure: { error: unknown } | null = null;

        try {
            typeIndex = await options.getTypeIndex(visibility);

            for (const instance of instances) {
                const [model, instanceUrl] = instance;

                if (visibility === 'public') {
                    await makeDocumentPublic(urlRoute(instanceUrl), options.remoteEngine);
                }

                await typeIndex.registerInstance(instanceUrl, model);

                registeredInstances.push(instance);
            }
        } catch (error) {
            failure = { error };
        }

        if (typeIndex && registeredInstances.length > 0) {
            await options.onModelsRegistered({
                typeIndex,
                models: arrayUnique(registeredInstances.map(([model]) => model)),
                mode: 'instance',
            });
        }

        if (failure) {
            const unregisteredInstances = instances.filter((instance) => !registeredInstances.includes(instance));

            unregisteredInstances.forEach(([model, instanceUrl]) =>
                removeRegisteredInstance(options.registeredInstances, instanceUrl, model),
            );

            await options.onModelsRegistrationFailed({
                models: arrayUnique(unregisteredInstances.map(([model]) => model)),
                error: failure.error,
                mode: 'instance',
            });
        }
    }
}
