import Container from 'soukai-bis/models/Container';
import { isInstanceOf, tap } from '@noeldemartin/utils';
import { DocumentNotFound, SoukaiError } from 'soukai-bis/errors';
import { requireEngine } from 'soukai-bis/engines';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import MultiModelRelation from './MultiModelRelation';
import { classMarker } from './helpers';

export default class ContainsRelation<
    Parent extends Container = Container,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public static [classMarker] = ['ContainsRelation', ...MultiModelRelation[classMarker]];

    public constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass, { foreignKeyName: '__unused__' });

        if (!isInstanceOf(parent, Container)) {
            throw new SoukaiError(
                `non-container model initialized for ContainsRelation: ${(parent as Model).static().modelName}`,
            );
        }
    }

    public setForeignAttributes(related: Related): void {
        const relatedDocumentUrl = related.getDocumentUrl();

        if (!relatedDocumentUrl || this.parent.resourceUrls.includes(relatedDocumentUrl)) {
            return;
        }

        this.parent.setAttribute('resourceUrls', this.parent.resourceUrls.concat([relatedDocumentUrl]));
    }

    public async load(): Promise<Related[]> {
        this.related = await this.loadContainedModels();

        return this.related;
    }

    public async create(attributes: Record<string, unknown> = {}): Promise<Related> {
        this.assertParentExists();

        const related = this.relatedClass.newInstance(attributes);

        related.url || related.mintUrl({ containerUrl: this.parent.url });

        return tap(this.attach(related), (model) => this.save(model));
    }

    public async save(model: Related): Promise<Related> {
        this.assertParentExists();

        return tap(model, async () => {
            const containerUrl = this.parent.url;

            await model.save(containerUrl);

            this.setForeignAttributes(model);

            await this.parent.save();
        });
    }

    protected assertParentExists(): void {
        if (this.parent.exists()) {
            return;
        }

        throw new SoukaiError('Cannot save a model because the container doesn\'t exist');
    }

    private async loadContainedModels(): Promise<Related[]> {
        const documentUrls = this.parent.resourceUrls;

        if (documentUrls.length === 0) {
            return [];
        }

        const engine = requireEngine();
        const models = await Promise.all(
            documentUrls.map(async (documentUrl) => {
                try {
                    const document = await engine.readOneDocument(documentUrl);

                    return this.relatedClass.createManyFromJsonLD(document);
                } catch (error) {
                    if (!isInstanceOf(error, DocumentNotFound)) {
                        throw error;
                    }

                    return [];
                }
            }),
        );

        return models.flat();
    }

}
