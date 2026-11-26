import type { SolidDocument } from '@noeldemartin/solid-utils';
import { silenced } from '@noeldemartin/utils';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import type { SyncApplicationModel } from 'soukai-bis/jobs/sync/SyncJob';
import { getDirtyDocumentsUpdates } from 'soukai-bis/models/concerns/crdts';
import { findMatchingRDFResourceUrls, hasMalformedRDFAttributes } from 'soukai-bis/models/concerns/rdf';
import { getDocumentQuads } from 'soukai-bis/models/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

export function getFixMalformedAttributesModels(
    applicationModels: SyncApplicationModel[],
    fixMalformedAttributes: boolean = false,
): ModelConstructor[] {
    return applicationModels
        .filter((applicationModel) => applicationModel.fixMalformedAttributes ?? fixMalformedAttributes)
        .map(({ model }) => model);
}

export async function getMalformedDocumentUpdates(
    document: SolidDocument,
    models: ModelConstructor[],
): Promise<EngineOperation[]> {
    if (models.length === 0 || document.url.endsWith('/')) {
        return [];
    }

    const quads = getDocumentQuads(document);
    const malformedModels: Model[] = [];
    const seenUrls = new Set<string>();

    for (const modelClass of models) {
        const matchingUrls = findMatchingRDFResourceUrls(modelClass, quads);

        for (const url of matchingUrls) {
            if (seenUrls.has(url) || !hasMalformedRDFAttributes(modelClass, url, quads)) {
                continue;
            }

            const instance = await silenced(modelClass.fromDocument(document).find(url));

            if (!instance?.hasMalformedAttributes()) {
                continue;
            }

            seenUrls.add(url);
            instance.fixMalformedAttributes();
            malformedModels.push(instance);
        }
    }

    if (malformedModels.length === 0) {
        return [];
    }

    return getDirtyDocumentsUpdates({ updatedModels: malformedModels, trackHistory: false });
}
