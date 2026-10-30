import { SolidDocumentPermissions } from '@noeldemartin/solid-utils';
import { arrayGroupBy } from '@noeldemartin/utils';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { safeContainerUrl } from 'soukai-bis/lib/internals/urls';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import Container from 'soukai-bis/models/ldp/Container';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

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

async function makeContainerPublic(container: ModelWithUrl<Container>, engine: SolidEngine): Promise<void> {
    const RemoteContainer = class extends Container {};

    RemoteContainer.setEngine(engine);

    await new RemoteContainer({ url: container.url }, { exists: true }).updatePublicPermissions([
        SolidDocumentPermissions.Read,
    ]);
}

export type TypeIndexVisibility = 'public' | 'private';

export interface ModelRegistration {
    containerUrl: string;
    visibility: TypeIndexVisibility;
}

export async function syncContainerRegistration(options: {
    container: ModelWithUrl<Container>;
    models: Set<ModelConstructor>;
    registeredContainers: Map<string, Set<ModelConstructor>>;
    modelRegistrations: Map<ModelConstructor, ModelRegistration>;
    remoteEngine: SolidEngine;
    getTypeIndex: (visibility: TypeIndexVisibility) => Promise<TypeIndex>;
    onModelsRegistered: (typeIndex: TypeIndex, models: ModelConstructor[]) => unknown;
    onModelsRegistrationFailed: (models: ModelConstructor[], error: unknown) => unknown;
}): Promise<void> {
    const unregisteredModels = getUnregisteredModels(options.container, options.models, options.registeredContainers);
    const modelsByVisibility = arrayGroupBy(
        unregisteredModels,
        (model) => options.modelRegistrations.get(model)?.visibility ?? 'private',
    );

    for (const [visibility, models] of Object.entries(modelsByVisibility) as [
        TypeIndexVisibility,
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
                    await makeContainerPublic(container, options.remoteEngine);
                }

                await container.register(typeIndex, containerModels);

                const containerRegisteredModels = options.registeredContainers.get(container.url) ?? new Set();

                containerModels.forEach((model) => containerRegisteredModels.add(model));
                registeredModels.push(...containerModels);

                options.registeredContainers.set(container.url, containerRegisteredModels);
            }
        } catch (error) {
            failure = { error };
        }

        // Containers registered before a failure have already changed the type index, so they must be reported.
        if (typeIndex && registeredModels.length > 0) {
            await options.onModelsRegistered(typeIndex, registeredModels);
        }

        if (failure) {
            await options.onModelsRegistrationFailed(
                models.filter((model) => !registeredModels.includes(model)),
                failure.error,
            );
        }
    }
}
