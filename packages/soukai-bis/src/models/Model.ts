import {
    MagicObject,
    arrayUnique,
    deepEquals,
    fail,
    isInstanceOf,
    isTruthy,
    objectDeepClone,
    required,
    stringToCamelCase,
    stringToSlug,
    urlResolve,
    urlRoute,
    uuid,
} from '@noeldemartin/utils';
import { RDFNamedNode, jsonldToQuads, quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import {
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS_PREDICATE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/utils/rdf';
import { getEngine, requireEngine } from 'soukai-bis/engines/state';
import type Engine from 'soukai-bis/engines/Engine';

import { createFromRDF, isUsingSameDocument, serializeToRDF } from './concerns/rdf';
import { getDirtyDocumentsUpdates } from './concerns/crdts';
import { isModelClass } from './utils';
import { isContainsRelation, isMultiModelRelation, isSingleModelRelation } from 'soukai-bis/models/relations/helpers';
import type HasManyRelation from './relations/HasManyRelation';
import type HasOneRelation from './relations/HasOneRelation';
import type Metadata from './crdts/Metadata';
import type Operation from './crdts/Operation';
import type Relation from './relations/Relation';
import type { Schema } from './schema';
import type { BootedModelClass, ModelConstructor, ModelWithHistory, ModelWithTimestamps, ModelWithUrl } from './types';

export interface MintUrlOptions {
    containerUrl?: string;
    documentUrl?: string;
    documentExists?: boolean;
    resourceHash?: string;
}

export default class Model<
    Attributes extends Record<string, unknown> = Record<string, unknown>,
    Relations extends Record<string, unknown> = Record<string, unknown>,
    FieldName extends string = string & keyof Attributes,
    RelationName extends string = string & keyof Relations,
> extends MagicObject {

    public static schema: Schema;
    protected static _defaultContainerUrl?: string;
    protected static _modelName?: string;
    private static __engine: Engine | null = null;
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

    public static getEngine(): Engine | undefined {
        return this.__engine ?? getEngine();
    }

    public static requireEngine(): Engine {
        return this.__engine ?? requireEngine();
    }

    public static setEngine(engine?: Engine): void {
        this.__engine = engine ?? null;
    }

    public static async find<T extends Model>(this: ModelConstructor<T>, url: string): Promise<ModelWithUrl<T> | null> {
        try {
            const engine = this.requireEngine();
            const document = await engine.readDocument(urlRoute(url));

            return this.createFromDocument(document, { url });
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
    ): Promise<ModelWithUrl<T>[]> {
        containerUrl ??= this.defaultContainerUrl;

        try {
            const engine = this.requireEngine();
            const container = await engine.readDocument(containerUrl);
            const containsQuads = container.statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE);
            const documents: Record<string, SolidDocument> = {};

            await Promise.all(
                containsQuads.map(async (quad) => {
                    const url = quad.object.value;
                    const subject = quad.object.termType === 'Literal' ? quad.object.value : quad.object;
                    const document = await engine.readDocument(url);

                    if (
                        !document ||
                        document.contains(subject, RDF_TYPE_PREDICATE, LDP_CONTAINER_OBJECT) ||
                        document.contains(subject, RDF_TYPE_PREDICATE, LDP_BASIC_CONTAINER_OBJECT)
                    ) {
                        return;
                    }

                    documents[url] = document;
                }),
            );

            const models = await Promise.all(
                Object.values(documents).map(async (document) => this.createManyFromDocument(document)),
            );

            return models.flat();
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound)) {
                throw error;
            }

            return [];
        }
    }

    public static async create<T extends Model>(
        this: ModelConstructor<T>,
        ...args: ConstructorParameters<ModelConstructor<T>>
    ): Promise<ModelWithUrl<T>> {
        const model = new this(...args);

        return model.save();
    }

    public static async createAt<T extends Model>(
        this: ModelConstructor<T>,
        containerUrl: string,
        ...args: ConstructorParameters<ModelConstructor<T>>
    ): Promise<ModelWithUrl<T>> {
        const model = new this(...args);

        model.mintUrl({ containerUrl });

        return model.save();
    }

    public static async createFromRDF<T extends Model>(
        this: ModelConstructor<T>,
        quads: Quad[],
        options: { url: string },
    ): Promise<ModelWithUrl<T> | null> {
        const url = options.url;
        const subject = new RDFNamedNode(url);
        const isType = quads
            .filter((q) => subject.equals(q.subject) && RDF_TYPE_PREDICATE.equals(q.predicate))
            .some((q) => this.schema.rdfClasses.some((rdfClass) => rdfClass.equals(q.object)));

        if (!isType) {
            return null;
        }

        return createFromRDF<T>(this, url, quads);
    }

    public static async createFromJsonLD<T extends Model>(
        this: ModelConstructor<T>,
        json: JsonLD,
        options: { url?: string } = {},
    ): Promise<ModelWithUrl<T> | null> {
        const url = options.url ?? json['@id'] ?? fail<string>('JsonLD is missing @id');
        const quads = await jsonldToQuads(json);

        return this.createFromRDF(quads, { url });
    }

    public static async createFromDocument<T extends Model>(
        this: ModelConstructor<T>,
        document: SolidDocument,
        options: { url?: string } = {},
    ): Promise<ModelWithUrl<T> | null> {
        const url = options.url ?? document.url;

        return this.createFromRDF(document.statements(), { url });
    }

    public static async createManyFromDocument<T extends Model>(
        this: ModelConstructor<T>,
        document: SolidDocument,
    ): Promise<ModelWithUrl<T>[]> {
        const matchingResourceUrls = arrayUnique(
            document
                .statements()
                .filter(
                    (q) =>
                        RDF_TYPE_PREDICATE.equals(q.predicate) &&
                        this.schema.rdfClasses.some((rdfClass) => rdfClass.equals(q.object)),
                )
                .map((q) => q.subject.value),
        );
        const models = await Promise.all(
            matchingResourceUrls.map((resourceUrl) => this.createFromDocument(document, { url: resourceUrl })),
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
    declare public createdAt?: Date;
    declare public updatedAt?: Date;
    declare public metadata?: Metadata;
    declare public relatedMetadata?: HasOneRelation<this, Metadata, typeof Metadata>;
    declare public operations?: Operation[];
    declare public relatedOperations?: HasManyRelation<this, Operation, typeof Operation>;

    protected _exists: boolean = false;
    protected _documentExists: boolean = false;
    protected _attributes: Attributes;
    protected _originalAttributes: Attributes;
    protected _dirtyAttributes: Set<FieldName>;
    protected _relations: Record<string, Relation> = {};

    public constructor(attributes: Record<string, unknown> = {}, exists: boolean = false) {
        super();

        if (this.static().isConjuring()) {
            this._attributes = {} as unknown as Attributes;
            this._originalAttributes = {} as unknown as Attributes;
            this._dirtyAttributes = new Set();

            return;
        }

        this._exists = exists;
        this._documentExists = exists;
        this._attributes = this.parseAttributes(attributes);
        this._originalAttributes = (exists ? objectDeepClone(this._attributes) : {}) as Attributes;
        this._dirtyAttributes = exists ? new Set() : new Set(Object.keys(this._attributes) as FieldName[]);

        this.initializeMetadata();
    }

    public getAttribute(field: FieldName): unknown {
        return this._attributes[field];
    }

    public getAttributes(): Attributes {
        return this._attributes;
    }

    public setAttribute(field: FieldName, value: unknown): void {
        this.setAttributes({ [field]: value } as Partial<Attributes>);
    }

    public setAttributes(attributes: Partial<Attributes>): void {
        const newAttributes: Record<string, unknown> = {};
        const shape = this.static('schema').fields.def.shape;

        for (const [field, value] of Object.entries(attributes)) {
            if (!(field in shape)) {
                continue;
            }

            const parsedValue = shape[field]?.parse(value);

            if (!this.attributeValueChanged(this._attributes[field], parsedValue)) {
                continue;
            }

            newAttributes[field] = parsedValue;
        }

        Object.assign(this._attributes, newAttributes);
        Object.keys(newAttributes).forEach((field) => this._dirtyAttributes.add(field as FieldName));
    }

    public getOriginalAttributes(): Attributes {
        return this._originalAttributes;
    }

    public getOriginalAttribute(field: FieldName): unknown {
        return this._originalAttributes[field];
    }

    public getRelation(name: RelationName): Relation {
        if (!(name in this._relations)) {
            const relation = required(
                this.static('schema').relations[name],
                `Relation '${name}' is not defined in the ${this.static().modelName} model.`,
            );

            if (!isModelClass(relation.relatedClass)) {
                const relatedClass = (relation.relatedClass as () => ModelConstructor)();

                relation.relationClass.validateRelatedClass(this, relatedClass);
                relation.relatedClass = relatedClass;
            }

            this._relations[name] = relation.relationClass.newInstance(this, relation.relatedClass, {
                foreignKeyName: relation.options.foreignKey,
                localKeyName: relation.options.localKey,
                usingSameDocument: relation.options.usingSameDocument,
            });
        }

        return this._relations[name] as Relation;
    }

    public async loadRelation(name: RelationName): Promise<void> {
        await this.getRelation(name).load();
    }

    public isRelationLoaded(name: RelationName): boolean {
        return this.getRelation(name).loaded;
    }

    public async loadRelationIfUnloaded(name: RelationName): Promise<void> {
        if (this.isRelationLoaded(name)) {
            return;
        }

        await this.loadRelation(name);
    }

    public mintUrl(options: MintUrlOptions = {}): string {
        if (!this.url) {
            this.url = this.newUrl(options);

            if (options.documentUrl) {
                this._documentExists = options.documentExists ?? true;
            }

            if (this.hasTimestamps()) {
                this.metadata.setAttribute('resourceUrl', this.url);
                this.metadata.mintUrl(options);
            }
        }

        return this.url;
    }

    public requireUrl(): string {
        return this.url ?? fail(SoukaiError, 'Failed getting required url');
    }

    public getDocumentUrl(): string | null {
        return this.url ? urlRoute(this.url) : null;
    }

    public requireDocumentUrl(): string {
        return this.getDocumentUrl() ?? fail(SoukaiError, 'Failed getting required document url');
    }

    public getDirtyAttributes(): FieldName[] {
        return Array.from(this._dirtyAttributes);
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
            return this._dirtyAttributes.has(field);
        }

        if (ignoreRelations) {
            return this._dirtyAttributes.size > 0;
        }

        const dirtyDocumentModels = this.getDocumentModels().filter((model) => model.isDirty(undefined, true));

        return dirtyDocumentModels.length > 0;
    }

    public cleanDirty(): void {
        this._dirtyAttributes.clear();
        this._originalAttributes = objectDeepClone(this._attributes);
    }

    public hasTimestamps(): this is ModelWithTimestamps<this> {
        return this.static('schema').timestamps;
    }

    public tracksChanges(): this is ModelWithHistory<this> {
        return this.static('schema').history;
    }

    public exists(): this is ModelWithUrl<this> {
        return this._exists;
    }

    public setExists(exists: boolean): void {
        this._exists = exists;
        this._documentExists = exists;
    }

    public documentExists(): this is ModelWithUrl<this> {
        return this._documentExists;
    }

    public setDocumentExists(documentExists: boolean): void {
        this._documentExists = documentExists;
    }

    public async delete(): Promise<this> {
        if (!this.exists()) {
            return this;
        }

        const engine = this.static().requireEngine();

        await engine.deleteDocument(this.requireDocumentUrl());

        this.setExists(false);

        return this;
    }

    public async save(containerUrl?: string): Promise<ModelWithUrl<this>> {
        if (this.exists() && !this.isDirty()) {
            return this;
        }

        await this.beforeSave({ containerUrl });
        await this.performSave();
        await this.afterSave();

        return this as ModelWithUrl<this>;
    }

    public update(attributes: Partial<Attributes>): Promise<ModelWithUrl<this>> {
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
        if (property in this._attributes) {
            return this._attributes[property];
        }

        if (this.static('schema').timestamps && (property === 'createdAt' || property === 'updatedAt')) {
            return (this._relations.metadata?.related as Metadata)?._attributes[property];
        }

        if (property in this.static('schema').relations) {
            return this._proxy.instance.getRelation(property as RelationName)?.related;
        }

        if (property.startsWith('related')) {
            const relation = stringToCamelCase(property.slice(7)) as RelationName;

            if (relation in this.static('schema').relations) {
                return this._proxy.instance.getRelation(relation);
            }
        }

        return super.__get(property);
    }

    protected __set(property: string, value: unknown): void {
        if (!this.isField(property)) {
            return;
        }

        this.setAttribute(property, value);
    }

    protected attributeValueChanged(originalValue: unknown, newValue: unknown): boolean {
        return !deepEquals(originalValue ?? null, newValue ?? null);
    }

    protected newUrl(options: MintUrlOptions = {}): string {
        const documentUrl = options.documentUrl ?? this.newUrlDocumentUrl(options);
        const resourceHash = options.resourceHash ?? this.static('schema').rdfDefaultResourceHash;

        return resourceHash ? `${documentUrl}#${resourceHash}` : documentUrl;
    }

    protected newUrlDocumentUrl(options: MintUrlOptions = {}): string {
        const slug = this.newUrlDocumentUrlSlug() ?? uuid();

        return urlResolve(options.containerUrl ?? this.static('defaultContainerUrl'), slug);
    }

    protected newUrlDocumentUrlSlug(): string | null {
        const slugField = this.static('schema').slugField as FieldName;
        const slugFieldValue = slugField && String(this.getAttribute(slugField));

        return (slugFieldValue && stringToSlug(slugFieldValue)) ?? null;
    }

    protected async beforeSave(options: MintUrlOptions = {}): Promise<void> {
        this.mintUrl(options);

        const now = new Date();
        const documentUrl = this.requireDocumentUrl();
        const documentExists = this._documentExists;
        const documentModels = this.getDocumentModels();

        for (const documentModel of documentModels) {
            documentModel.mintUrl({ documentUrl, documentExists, resourceHash: uuid() });
        }

        for (const documentModel of documentModels) {
            if (!documentModel.isDirty()) {
                continue;
            }

            documentModel.touch(now);

            for (const relation of Object.values(documentModel._relations)) {
                relation.getLoadedModels().forEach((model) => relation.setForeignAttributes(model));
            }
        }
    }

    protected async performSave(): Promise<void> {
        const engine = this.static().requireEngine();

        if (this._documentExists) {
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

    protected initializeMetadata(): void {
        if (!this.hasTimestamps()) {
            return;
        }

        const metadata = this.relatedMetadata.attach({
            resourceUrl: this.url,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        this.url && metadata.mintUrl();
    }

    protected touch(now: Date): void {
        if (!this.hasTimestamps()) {
            return;
        }

        this.exists() || this.metadata.setAttribute('createdAt', now ?? new Date());
        this.metadata.setAttribute('updatedAt', now ?? new Date());
    }

    private parseAttributes(values: unknown): Attributes {
        return this.static('schema').fields.parse(values) as Attributes;
    }

    private isField(property: string): property is FieldName {
        return property in this.static('schema').fields.def.shape;
    }

    private populateDocumentModels(documentModels: Set<Model>): void {
        if (documentModels.has(this)) {
            return;
        }

        const documentUrl = this.getDocumentUrl();

        documentModels.add(this);

        for (const relation of Object.values(this._relations)) {
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
