import {
    Attributes,
    BelongsToManyRelation,
    BelongsToOneRelation,
    EngineDocument,
    EngineDocumentsCollection,
    EngineHelper,
    HasManyRelation,
} from 'soukai';

import SolidModel from '@/models/SolidModel';

import RDF from '@/solid/utils/RDF';

export default class SolidHasManyRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends typeof SolidModel = typeof SolidModel,
> extends HasManyRelation<Parent, Related, RelatedClass> {

    __modelsToStoreInSameDocument: Related[] = [];
    __modelsInSameDocument?: Related[];
    __modelsInOtherDocumentIds?: string[];

    public addModelToStoreInSameDocument(related: Related): void {
        this.__modelsToStoreInSameDocument.push(related);
    }

    public async resolve(): Promise<Related[]> {
        if (!this.__modelsInSameDocument || !this.__modelsInOtherDocumentIds)
            // Solid hasMany relation only finds related models that have been
            // declared in the same document.
            return [];

        const modelsInOtherDocuments = await this.relatedClass.all<Related>({
            $in: this.__modelsInOtherDocumentIds,
        });

        this.related = [
            ...this.__modelsInSameDocument,
            ...modelsInOtherDocuments,
        ];

        return this.related;
    }

    /**
     * This method will create an instance of the related model and call the [[save]] method.
     *
     * @param attributes Attributes to create the related instance.
     * @param useSameDocument Whether to use the same document to store the related model or not.
     */
    public async create(attributes: Attributes = {}, useSameDocument: boolean = false): Promise<Related> {
        const model = this.relatedClass.newInstance<Related>(attributes);

        await this.save(model, useSameDocument);

        return model;
    }

    /**
     * This method will bind up all the relevant data (foreignKey, inverse relations, etc.) and save the model.
     * If the parent model does not exist and both models will be stored in the same document, the model will
     * be saved when the parent model is saved instead.
     *
     * @param model Related model instance to save.
     * @param useSameDocument Whether to use the same document to store the related model or not.
     */
    public async save(model: Related, useSameDocument: boolean = false): Promise<void> {
        this.inititalizeInverseRelations(model);
        this.related = [...(this.related || []), model];

        if (!useSameDocument)
            await model.save();

        this.__modelsToStoreInSameDocument.push(model);

        if (!this.parent.exists())
            return;

        await this.parent.save();
    }

    public async __loadDocumentModels(document: EngineDocument): Promise<void> {
        const helper = new EngineHelper();
        const foreignProperty = this.relatedClass.fields[this.foreignKeyName]?.rdfProperty;
        const filters = this.relatedClass.prepareEngineFilters();
        const documents = (document['@graph'] as any[])
            .filter(resource => {
                const property = RDF.getJsonLDProperty(resource, foreignProperty);

                return typeof property === 'object'
                    && '@id' in property
                    && property['@id'] === this.parent.url;
            })
            .reduce((documents, resource) => {
                documents[resource['@id']] = { '@graph': [resource] };

                return documents;
            }, {} as EngineDocumentsCollection);

        this.__modelsInSameDocument = await Promise.all(
            Object
                .entries(helper.filterDocuments(documents, filters))
                .map(
                    ([id, document]) =>
                        this.relatedClass.createFromEngineDocument(id, document) as Promise<Related>,
                ),
        );

        this.__modelsInOtherDocumentIds = Object.keys(documents).filter(
            resourceId => !this.__modelsInSameDocument!.find(model => model.url === resourceId),
        );

        if (this.__modelsInOtherDocumentIds.length > 0)
            return;

        this.related = this.__modelsInSameDocument;
    }

    protected inititalizeInverseRelations(model: Related): void {
        const parentClass = this.parent.constructor;

        for (const relationName of this.relatedClass.relations) {
            const relationInstance = model.getRelation(relationName);

            if (relationInstance!.relatedClass !== parentClass)
                continue;

            if (relationInstance instanceof BelongsToManyRelation) {
                model.setAttribute(relationInstance.foreignKeyName, [this.parent.url]);
                relationInstance.related = [this.parent];

                continue;
            }

            if (!(relationInstance instanceof BelongsToOneRelation))
                continue;

            model.setAttribute(relationInstance.foreignKeyName, this.parent.url);
            relationInstance.related = this.parent;
        }
    }

}
