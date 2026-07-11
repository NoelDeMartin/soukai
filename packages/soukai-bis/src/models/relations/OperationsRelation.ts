import type { Quad } from '@rdfjs/types';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getCoreOperationModels } from 'soukai-bis/models/crdts/core-lazy';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type Model from 'soukai-bis/models/Model';
import type { ModelWithUrl } from 'soukai-bis/models/types';

import HasManyRelation from './HasManyRelation';
import { requireBootedModel } from 'soukai-bis/models/registry';

export default class OperationsRelation<Parent extends Model> extends HasManyRelation<
    Parent,
    Operation,
    typeof Operation
> {

    protected async loadRelatedModels(): Promise<Operation[]> {
        const parentUrl = this.parent.url;

        if (!parentUrl) {
            return [];
        }

        if (!this.usingSameDocument) {
            throw new SoukaiError('OperationsRelation can only be used with the same document');
        }

        const documentUrl = this.parent.getDocumentUrl();

        if (!documentUrl) {
            return [];
        }

        const engine = requireBootedModel('Operation').requireEngine();
        const document = await engine.readDocument(documentUrl);
        const allOperations = (await Promise.all(
            getCoreOperationModels().map((model) => model.createManyFromDocument(document)),
        )) as ModelWithUrl<Operation>[][];

        return allOperations.flat().filter((model) => model.resourceUrl === parentUrl);
    }

    protected async loadRelatedModelsFromDocumentRDF(
        quads: Quad[],
        options: { modelsCache?: Map<string, Model> } = {},
    ): Promise<Operation[]> {
        const parentUrl = this.parent.url;
        const allOperations = (await Promise.all(
            getCoreOperationModels().map((model) => {
                return model.createManyFromRDF(quads, { modelsCache: options.modelsCache });
            }),
        )) as ModelWithUrl<Operation>[][];

        return allOperations.flat().filter((model) => model.resourceUrl === parentUrl);
    }

}
