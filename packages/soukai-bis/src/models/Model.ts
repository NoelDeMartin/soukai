import {
    MagicObject,
    arrayUnique,
    fail,
    isInstanceOf,
    isTruthy,
    objectOnly,
    required,
    stringToCamelCase,
    urlResolve,
    urlRoute,
    uuid,
} from '@noeldemartin/utils';
import { RDFNamedNode, jsonldToQuads, quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { NamedNode, Quad } from '@rdfjs/types';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import { requireEngine } from 'soukai-bis/engines/state';
import { RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';

import { createFromRDF, isUsingSameDocument, serializeToRDF } from './concerns/rdf';
import { getDirtyDocumentsUpdates } from './concerns/crdts';
import { isModelClass } from './utils';
import { isContainsRelation, isMultiModelRelation, isSingleModelRelation } from 'soukai-bis/models/relations/helpers';
import type Relation from './relations/Relation';
import type { Schema } from './schema';
import type { BootedModelClass, MintedModel, ModelConstructor } from './types';

export default class Model<
    Attributes extends Record<string, unknown> = Record<string, unknown>,
    Relations extends Record<string, unknown> = Record<string, unknown>,
    FieldName extends string = Exclude<keyof Attributes, number | symbol>,
    RelationName extends string = Exclude<keyof Relations, number | symbol>,
> extends MagicObject {

    public static schema: Schema;
    protected static _defaultContainerUrl?: string;
    protected static _modelName?: string;
    private static __booted: boolean = false;

    public static get defaultContainerUrl(): string {
        return this._defaultContainerUrl ?? this.booted()._defaultContainerUrl;
    }

    public static set defaultContainerUrl(value: string) {
        this._defaultContainerUrl = value;
    }

    public static get modelName(): string {
        return this._modelName ?? this.booted()._modelName;
    }

    public static boot<T extends typeof Model>(this: T, name?: string): void {
        if (this.__booted) {
            throw new SoukaiError(`${this.name} model already booted`);
        }

        this._modelName ??= name ?? this.name;
        this._defaultContainerUrl ??= `solid://${stringToCamelCase(this._modelName)}s/`;
        this.__booted = true;
    }

    public static reset(): void {
        this.__booted = false;
    }

    public static newInstance<T extends Model>(
        this: ModelConstructor<T>,
        attributes?: Record<string, unknown>,
        exists?: boolean,
    ): T {
        return new this(attributes, exists);
    }

    public static async find<T extends Model>(this: ModelConstructor<T>, url: string): Promise<MintedModel<T> | null> {
        try {
            const engine = requireEngine();
            const document = await engine.readOneDocument(urlRoute(url));

            return this.createFromJsonLD(document, { url });
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound)) {
                throw error;
            }

            return null;
        }
    }

    public static async all<T extends Model>(
        this: ModelConstructor<T>,
        containerUrl?: string,
    ): Promise<MintedModel<T>[]> {
        const engine = requireEngine();
        const documents = await engine.readManyDocuments(containerUrl ?? this.defaultContainerUrl);
        const models = await Promise.all(
            Object.values(documents).map(async (document) => this.createManyFromJsonLD(document)),
        );

        return models.flat();
    }

    public static async create<T extends Model>(
        this: ModelConstructor<T>,
        ...args: ConstructorParameters<ModelConstructor<T>>
    ): Promise<MintedModel<T>> {
        const model = new this(...args);

        return model.save();
    }

    public static async createFromRDF<T extends Model>(
        this: ModelConstructor<T>,
        quads: Quad[],
        options: { url: string },
    ): Promise<MintedModel<T> | null> {
        const url = options.url;
        const subject = new RDFNamedNode(url);
        const isType = (rdfClass: NamedNode) =>
            quads.some(
                (q) => subject.equals(q.subject) && RDF_TYPE_PREDICATE.equals(q.predicate) && rdfClass.equals(q.object),
            );

        if (!this.schema.rdfClasses.some(isType)) {
            return null;
        }

        return createFromRDF<T>(this, url, quads);
    }

    public static async createFromJsonLD<T extends Model>(
        this: ModelConstructor<T>,
        json: JsonLD,
        options: { url?: string } = {},
    ): Promise<MintedModel<T> | null> {
        const url = options.url ?? json['@id'] ?? fail<string>('JsonLD is missing @id');
        const quads = await jsonldToQuads(json);

        return this.createFromRDF(quads, { url });
    }

    public static async createManyFromJsonLD<T extends Model>(
        this: ModelConstructor<T>,
        json: JsonLD,
    ): Promise<MintedModel<T>[]> {
        const quads = await jsonldToQuads(json);
        const matchingResourceUrls = arrayUnique(
            quads
                .filter(
                    (q) =>
                        RDF_TYPE_PREDICATE.equals(q.predicate) &&
                        this.schema.rdfClasses.some((rdfClass) => rdfClass.equals(q.object)),
                )
                .map((q) => q.subject.value),
        );
        const models = await Promise.all(
            matchingResourceUrls.map((resourceUrl) => this.createFromRDF(quads, { url: resourceUrl })),
        );

        return models.filter(isTruthy);
    }

    public static<T extends typeof Model>(): T;
    public static<T extends typeof Model, K extends keyof T>(property: K): T[K];
    public static<T extends typeof Model, K extends keyof T>(property?: K): T | T[K] {
        return super.static<T, K>(property as K);
    }

    private static booted<T extends typeof Model>(this: T): BootedModelClass<T> {
        if (!this.__booted) {
            this._modelName ??= this.name;
            this._defaultContainerUrl ??= `solid://${stringToCamelCase(this._modelName)}s/`;
            this.__booted = true;
        }

        return this as BootedModelClass<T>;
    }

    declare public url?: string;
    private __exists: boolean = false;
    private __documentExists: boolean = false;
    private __attributes: Attributes;
    private __dirtyAttributes: Set<FieldName>;
    private __relations: Record<string, Relation> = {};

    public constructor(attributes: Record<string, unknown> = {}, exists: boolean = false) {
        super();

        if (this.static().isConjuring()) {
            this.__attributes = {} as unknown as Attributes;
            this.__dirtyAttributes = new Set();

            return;
        }

        this.__exists = exists;
        this.__documentExists = exists;
        this.__attributes = this.parseAttributes(attributes);
        this.__dirtyAttributes = exists ? new Set() : new Set(Object.keys(this.__attributes) as FieldName[]);
    }

    public getAttribute(field: FieldName): unknown {
        return this.__attributes[field];
    }

    public getAttributes(): Attributes {
        return this.__attributes;
    }

    public setAttribute(field: FieldName, value: unknown): void {
        this.setAttributes({ [field]: value } as Partial<Attributes>);
    }

    public setAttributes(attributes: Partial<Attributes>): void {
        const updateSchemas = objectOnly(this.static().schema.fields.def.shape, Object.keys(attributes));
        const parsedAttributes = Object.fromEntries(
            Object.entries(updateSchemas).map(([field, fieldSchema]) => [field, fieldSchema.parse(attributes[field])]),
        );

        Object.assign(this.__attributes, parsedAttributes);
        Object.keys(parsedAttributes).forEach((field) => this.__dirtyAttributes.add(field as FieldName));
    }

    public getRelation(name: RelationName): Relation {
        if (!(name in this.__relations)) {
            const relation = required(
                this.static().schema.relations[name],
                `Relation '${name}' is not defined in the ${this.static().modelName} model.`,
            );

            if (!isModelClass(relation.relatedClass)) {
                const relatedClass = (relation.relatedClass as () => ModelConstructor)();

                relation.relationClass.validateRelatedClass(this, relatedClass);
                relation.relatedClass = relatedClass;
            }

            this.__relations[name] = relation.relationClass.newInstance(this, relation.relatedClass, {
                foreignKeyName: relation.options.foreignKey,
                localKeyName: relation.options.localKey,
                usingSameDocument: relation.options.usingSameDocument,
            });
        }

        return this.__relations[name] as Relation;
    }

    public async loadRelation(name: RelationName): Promise<void> {
        await this.getRelation(name).load();
    }

    public mintUrl(documentUrl?: string, documentExists?: boolean, resourceHash?: string): void {
        this.url ??= this.newUrl(documentUrl, resourceHash);

        if (documentUrl) {
            this.__documentExists = documentExists ?? true;
        }
    }

    public getDocumentUrl(): string | null {
        return this.url ? urlRoute(this.url) : null;
    }

    public requireDocumentUrl(): string {
        return this.getDocumentUrl() ?? fail(SoukaiError, 'Failed getting required document url');
    }

    public getDirtyAttributes(): FieldName[] {
        return Array.from(this.__dirtyAttributes);
    }

    public getDocumentModels(): Model[] {
        const modelsSet = new Set<Model>();

        this.populateDocumentModels(modelsSet);

        return Array.from(modelsSet);
    }

    public getDirtyDocumentModels(): Model[] {
        return this.getDocumentModels().filter((model) => model.isDirty(undefined, true));
    }

    public isDirty(field?: FieldName, ignoreRelations?: boolean): boolean {
        if (field) {
            return this.__dirtyAttributes.has(field);
        }

        if (ignoreRelations) {
            return this.__dirtyAttributes.size > 0;
        }

        const dirtyDocumentModels = this.getDocumentModels().filter((model) => model.isDirty(undefined, true));

        return dirtyDocumentModels.length > 0;
    }

    public cleanDirty(): void {
        this.__dirtyAttributes.clear();
    }

    public exists(): this is MintedModel<this> {
        return this.__exists;
    }

    public setExists(exists: boolean): void {
        this.__exists = exists;
        this.__documentExists = exists;
    }

    public documentExists(): this is MintedModel<this> {
        return this.__documentExists;
    }

    public setDocumentExists(documentExists: boolean): void {
        this.__documentExists = documentExists;
    }

    public async delete(): Promise<this> {
        if (!this.exists()) {
            return this;
        }

        const engine = requireEngine();

        await engine.deleteDocument(this.requireDocumentUrl());

        this.setExists(false);

        return this;
    }

    public async save(): Promise<MintedModel<this>> {
        if (this.exists() && !this.isDirty()) {
            return this;
        }

        await this.beforeSave();
        await this.performSave();
        await this.afterSave();

        return this as MintedModel<this>;
    }

    public update(attributes: Partial<Attributes>): Promise<MintedModel<this>> {
        this.setAttributes(attributes);

        return this.save();
    }

    public async toJsonLD(): Promise<JsonLD> {
        return quadsToJsonLD(serializeToRDF(this.getDocumentModels()));
    }

    public async toTurtle(): Promise<string> {
        return quadsToTurtle(serializeToRDF(this.getDocumentModels()));
    }

    protected __get(property: string): unknown {
        if (property in this.__relations) {
            return this.__relations[property]?.related;
        }

        if (property.startsWith('related') && property !== 'related') {
            const relation = stringToCamelCase(property.slice(7)) as RelationName;

            if (relation in this.static().schema.relations) {
                return this.getRelation(relation);
            }
        }

        return this.__attributes[property];
    }

    protected __set(property: string, value: unknown): void {
        if (!this.isField(property)) {
            return;
        }

        this.setAttribute(property, value);
    }

    protected newUrl(documentUrl?: string, resourceHash?: string | null): string {
        documentUrl = documentUrl ?? urlResolve(this.static('defaultContainerUrl'), uuid());
        resourceHash = resourceHash ?? 'it';

        return `${documentUrl}#${resourceHash}`;
    }

    protected async beforeSave(): Promise<void> {
        this.mintUrl();

        const documentUrl = this.requireDocumentUrl();
        const documentExists = this.__documentExists;
        const documentModels = this.getDocumentModels();

        for (const documentModel of documentModels) {
            if (documentModel.url) {
                continue;
            }

            documentModel.mintUrl(documentUrl, documentExists, uuid());
        }

        for (const documentModel of documentModels) {
            for (const relation of Object.values(documentModel.__relations)) {
                relation.getLoadedModels().forEach((model) => relation.setForeignAttributes(model));
            }
        }
    }

    protected async performSave(): Promise<void> {
        const engine = requireEngine();

        if (this.__documentExists) {
            await engine.updateDocument(
                this.requireDocumentUrl(),
                getDirtyDocumentsUpdates(this.getDirtyDocumentModels()),
            );
        } else {
            await engine.createDocument(this.requireDocumentUrl(), await this.toJsonLD());
        }
    }

    protected async afterSave(): Promise<void> {
        const modelDocuments = this.getDocumentModels();

        for (const modelDocument of modelDocuments) {
            modelDocument.setExists(true);
            modelDocument.setDocumentExists(true);
            modelDocument.cleanDirty();
        }
    }

    private parseAttributes(values: unknown): Attributes {
        return this.static().schema.fields.parse(values) as Attributes;
    }

    private isField(property: string): property is FieldName {
        return property in this.static().schema.fields.def.shape;
    }

    private populateDocumentModels(documentModels: Set<Model>): void {
        if (documentModels.has(this)) {
            return;
        }

        const documentUrl = this.getDocumentUrl();

        documentModels.add(this);

        for (const relation of Object.values(this.__relations)) {
            if (!relation.loaded) {
                continue;
            }

            const isContainsRelationInstance = isContainsRelation(relation);

            if (
                isSingleModelRelation(relation) &&
                relation.__newModel &&
                isUsingSameDocument(documentUrl, relation, relation.__newModel)
            ) {
                relation.__newModel.populateDocumentModels(documentModels);
            }

            if (isMultiModelRelation(relation)) {
                for (const newModel of relation.__newModels ?? []) {
                    if (!isUsingSameDocument(documentUrl, relation, newModel)) {
                        continue;
                    }

                    newModel.populateDocumentModels(documentModels);
                }
            }

            relation
                .getLoadedModels()
                .filter(
                    (model: Model) => isContainsRelationInstance || isUsingSameDocument(documentUrl, relation, model),
                )
                .forEach((model: Model) => model.populateDocumentModels(documentModels));
        }
    }

}
