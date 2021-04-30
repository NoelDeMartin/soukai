import {
    arrayUnique,
    stringToSlug,
    urlDirectoryName,
    urlParentDirectory,
    urlResolveDirectory,
    uuid,
} from '@noeldemartin/utils';
import { FieldType } from 'soukai';
import type { MultiModelRelation } from 'soukai';

import IRI from '@/solid/utils/IRI';

import SolidContainerDocumentsRelation from './relations/SolidContainerDocumentsRelation';
import SolidContainsRelation from './relations/SolidContainsRelation';

import { SolidModel } from './SolidModel';
import type SolidDocument from './SolidDocument';

export default class SolidContainerModel extends SolidModel {

    public static boot(name?: string): void {
        const modelClass = this;

        // Add container definitions.
        modelClass.rdfsClasses = arrayUnique((modelClass.rdfsClasses ?? []).concat([IRI('ldp:Container')]));
        modelClass.fields = modelClass.fields ?? {};
        modelClass.fields['resourceUrls'] = {
            type: FieldType.Array,
            required: false,
            rdfProperty: IRI('ldp:contains'),
            items: {
                type: FieldType.Key,
            },
        };

        // Boot model.
        super.boot(name);
    }

    public resourceUrls!: string[];
    public documents!: SolidDocument[];
    public relatedDocuments!: MultiModelRelation<SolidContainerModel, SolidDocument, typeof SolidDocument>;

    public documentsRelationship(): MultiModelRelation {
        return new SolidContainerDocumentsRelation(this);
    }

    public async save(collection?: string): Promise<this> {
        await super.save(collection);

        if (this.wasRecentlyCreated() && !this.isRelationLoaded('documents'))
            this.setRelationModels('documents', []);

        return this;
    }

    protected contains<T extends typeof SolidModel>(model: T): MultiModelRelation {
        return new SolidContainsRelation(this, model);
    }

    protected newUrl(): string {
        const slug = this.hasAttribute('name') ? stringToSlug(this.getAttribute('name')) : uuid();

        return urlResolveDirectory(this.static('collection'), slug);
    }

    protected newUniqueUrl(url?: string): string {
        url = url ?? this.newUrl();

        const directoryName = urlDirectoryName(url);

        return urlResolveDirectory(urlParentDirectory(url), `${directoryName}-${uuid()}`);
    }

}
