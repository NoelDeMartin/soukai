import { arrayFilter, escapeRegexText, silenced, urlRoute } from '@noeldemartin/utils';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type { ModelConstructor } from 'soukai-bis/models';
import { getBootedModels } from 'soukai-bis/models/registry';

type ExternalSourceLocation =
    | { containerUrl: string; instanceUrl?: undefined }
    | { instanceUrl: string; containerUrl?: undefined };

export type ExternalSource = ExternalSourceLocation & { models: ModelConstructor[] };
export type SerializedExternalSource = ExternalSourceLocation & { modelNames: string[] };

export function getExternalSourceUrl(source: ExternalSource): string {
    return source.containerUrl !== undefined ? source.containerUrl : urlRoute(source.instanceUrl);
}

export function isInExternalSource(source: ExternalSource, url: string): boolean {
    return source.containerUrl !== undefined
        ? url.startsWith(source.containerUrl)
        : urlRoute(url) === urlRoute(source.instanceUrl);
}

export function serializeExternalSource({ models, ...location }: ExternalSource): SerializedExternalSource {
    return { ...location, modelNames: models.map((model) => model.modelName) };
}

export function restoreExternalSource({ modelNames, ...location }: SerializedExternalSource): ExternalSource {
    const bootedModels = getBootedModels();
    const models = arrayFilter(modelNames.map((modelName) => bootedModels.get(modelName)));
    const externalSource: ExternalSource = { ...location, models };

    if (models.length !== modelNames.length) {
        throw new SoukaiError(
            `Can't restore external source ${getExternalSourceUrl(externalSource)}, some of its models aren't ` +
                `booted (${modelNames.join(', ')})`,
        );
    }

    return externalSource;
}

export function assertExternalSourceModelsBooted(source: ExternalSource): void {
    const bootedModels = getBootedModels();

    for (const model of source.models) {
        if (bootedModels.get(model.modelName) !== model) {
            throw new SoukaiError(
                `Can't add external source ${getExternalSourceUrl(source)}, ` +
                    `the '${model.modelName}' model class isn't booted`,
            );
        }
    }
}

export async function deleteExternalSourceData(source: ExternalSource): Promise<void> {
    if (source.containerUrl !== undefined) {
        await requireLocalEngine().dropContainers(new RegExp(`^${escapeRegexText(source.containerUrl)}`));

        return;
    }

    await silenced(requireLocalEngine().deleteDocument(getExternalSourceUrl(source)), { ignore: DocumentNotFound });
}
