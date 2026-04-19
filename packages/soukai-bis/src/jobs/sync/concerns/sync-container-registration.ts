import Container from 'soukai-bis/models/ldp/Container';
import { safeContainerUrl } from 'soukai-bis/utils/urls';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
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
    modelRegistrationPaths: Map<ModelConstructor, string>,
): [ModelWithUrl<Container>, ModelConstructor[]][] {
    const modelsByContainerUrl = {} as Record<string, ModelConstructor[]>;

    for (const model of unregisteredModels) {
        const registrationPath = modelRegistrationPaths.get(model);

        if (!registrationPath || !container.url.startsWith(registrationPath)) {
            modelsByContainerUrl[container.url] ??= [];
            modelsByContainerUrl[container.url]?.push(model);

            continue;
        }

        modelsByContainerUrl[registrationPath] ??= [];
        modelsByContainerUrl[registrationPath]?.push(model);
    }

    return Object.entries(modelsByContainerUrl).map(([containerUrl, models]) => [
        new Container({ url: containerUrl }, true) as ModelWithUrl<Container>,
        models,
    ]);
}

export async function syncContainerRegistration(options: {
    container: ModelWithUrl<Container>;
    models: Set<ModelConstructor>;
    registeredContainers: Map<string, Set<ModelConstructor>>;
    modelRegistrationPaths: Map<ModelConstructor, string>;
    getTypeIndex: () => Promise<TypeIndex>;
    onModelsRegistered: (typeIndex: TypeIndex, models: ModelConstructor[]) => unknown;
}): Promise<void> {
    const unregisteredModels = getUnregisteredModels(options.container, options.models, options.registeredContainers);

    if (unregisteredModels.length === 0) {
        return;
    }

    const typeIndex = await options.getTypeIndex();
    const unregisteredContainers = getUnregisteredContainers(
        options.container,
        unregisteredModels,
        options.modelRegistrationPaths,
    );

    for (const [container, models] of unregisteredContainers) {
        await container.register(typeIndex, models);
    }

    await options.onModelsRegistered(typeIndex, unregisteredModels);
}
