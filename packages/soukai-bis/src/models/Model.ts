import { SolidDocumentPermissions, quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { JsonLD, SolidDocument, SolidDocumentPermission } from '@noeldemartin/solid-utils';
import {
    MagicObject,
    applyStrictChecks,
    arrayFrom,
    arrayUnique,
    deepEquals,
    fail,
    isInstanceOf,
    isString,
    isTruthy,
    objectDeepClone,
    objectFromEntries,
    required,
    shortId,
    stringToCamelCase,
    stringToSlug,
    urlParentDirectory,
    urlResolve,
    urlRoute,
    uuid,
} from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type Engine from 'soukai-bis/engines/Engine';
import { hasLocalDeletions } from 'soukai-bis/engines/local-changes';
import type { LocalEngineWriteOptions } from 'soukai-bis/engines/LocalEngine';
import { getEngine, getRemoteEngine, requireEngine, requireRemoteEngine } from 'soukai-bis/engines/state';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import InvalidAttributeError from 'soukai-bis/errors/InvalidAttributeError';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import NonAuthoritativeDocument from 'soukai-bis/errors/NonAuthoritativeDocument';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { PURL_CREATED, PURL_MODIFIED } from 'soukai-bis/lib/internals/rdf';
import { getRDFIRIVariants } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import { ZodError } from 'zod';

import type ACLAuthorization from './acl/ACLAuthorization';
import type ACPAccessControlResource from './acp/ACPAccessControlResource';
import { isChangeTrackingDisabled } from './change-tracking';
import ComputedAttribute from './computed-attributes/ComputedAttribute';
import { refreshComputedAttributes } from './computed-attributes/registry';
import { newACPAccessControlResource } from './concerns/acp';
import { fetchPermissions } from './concerns/authorization';
import { boot, getMeta, reset, setMeta } from './concerns/boot';
import {
    deletingModelsEmptiesDocument,
    getDeleteModelsOperations,
    getDeletedModelsCrdtModels,
    getDirtyDocumentsUpdates,
    getResourceOperationUrls,
    syncDocumentOperations,
} from './concerns/crdts';
import { cascadeDeletes, cascadeDeletesInDocument, deleteModels, markForDeletion } from './concerns/deletes';
import {
    assertMutableModels,
    assertRestorableModels,
    createdModelsLocalChanges,
    isCreatedLocally,
    isDeletedLocally,
    recordsLocalChanges,
    updatedModelsLocalChanges,
} from './concerns/local-changes';
import { migrateSchema } from './concerns/migrations';
import { initializeEmptyDocumentRelations, isUsingSameDocument, loadDocumentRelations } from './concerns/rdf';
import { updateModelSchema } from './concerns/schemas';
import { hydrateModel, serializeModel } from './concerns/serialization';
import type { SerializedModel } from './concerns/serialization';
import type Metadata from './crdts/Metadata';
import type Operation from './crdts/Operation';
import type Tombstone from './crdts/Tombstone';
import type { ModelClassEvent, ModelInstanceEvent, ModelInstanceListener, ModelListener } from './events';
import { emitModelClassEvent, emitModelInstanceEvent } from './events';
import { offModelEvent, onModelEvent } from './internals/events';
import {
    CLASS_MARKER,
    SCHEMA,
    getFieldRDFProperties,
    getSchema,
    mintedUrls,
    modelsUsingSoftDeletes,
    replaceSchema,
} from './internals/model';
import type { MODEL_TIMESTAMPS_MARKER } from './internals/model';
import { createWACAuthorization, updatePublicPermissions } from './internals/permissions';
import { convertToRelativeQuads, serializeToRDF } from './internals/rdf';
import { resolveTypeIndex } from './interop/internals';
import type TypeIndex from './interop/TypeIndex';
import type { RDFClassesInput } from './matching/RDFClassesMatcher';
import ModelBuilder from './ModelBuilder';
import type { FindFromRDFOptions, FromJsonLDOptions, FromRDFOptions, FromTurtleOptions } from './ModelBuilder';
import type HasManyRelation from './relations/HasManyRelation';
import type HasOneRelation from './relations/HasOneRelation';
import { isContainsRelation, isMultiModelRelation, isSingleModelRelation } from './relations/helpers';
import { DETACHED_MODELS, NEW_MODEL, NEW_MODELS } from './relations/internals';
import type Relation from './relations/Relation';
import type { GetLoadedRelationModels, SchemaRelationDefinition, SchemaRelations } from './relations/schema';
import { createRelation } from './relations/utils';
import type { Schema, SchemaComputedAttributeDefinition, TimestampField } from './schema';
import type {
    AuthorizationProtocol,
    FetchPermissionsOptions,
    LegacyTimestamps,
    ModelPermissions,
    ModelRDFPrefixAliases,
    WACAuthorizationInput,
} from './types';
import type {
    ModelConstructor,
    ModelInstanceType,
    ModelWithHistory,
    ModelWithTimestamps,
    ModelWithTombstones,
    ModelWithUrl,
} from './types';

export interface MintUrlOptions {
    containerUrl?: Nullable<string>;
    documentUrl?: Nullable<string>;
    documentExists?: Nullable<boolean>;
    resourceHash?: Nullable<string>;
    slugSuffix?: Nullable<string>;
}

export interface BeforeSaveOptions extends MintUrlOptions {
    date?: Nullable<Date>;
}

export interface DeleteModelsOptions {
    deletingUrls?: Set<string>;
    date?: Nullable<Date>;
}

export interface PerformDeleteOptions extends DeleteModelsOptions {
    deletedWith?: Model[];
}

export interface SaveOptions {
    containerUrl?: Nullable<string>;
    postToContainer?: Nullable<boolean>;
    date?: Nullable<Date>;
}

export interface ModelConstructorOptions {
    exists?: Nullable<boolean>;
    initializeMetadata?: Nullable<boolean>;
    source?: Nullable<Quad[]>;
}

export type FindOptions = FindFromRDFOptions;

export type PendingSoftDeletion = 'soft-delete' | 'restore';

export interface LoadAllOptions {
    from?: string;
    includeSoftDeleted?: boolean;
    deep?: boolean;
    depth?: number;
    $in?: string[];
    onDocumentError?: (error: unknown, documentUrl: string) => unknown;
}

export type UrlFromSlugOptions = Pick<MintUrlOptions, 'containerUrl'>;

export default class Model<
    Attributes extends Record<string, unknown> = Record<string, unknown>,
    Relations extends Record<string, unknown> = Record<string, unknown>,
    TimestampFieldName extends TimestampField = TimestampField,
    FieldName extends string = string & keyof Attributes,
    RelationName extends string = string & keyof Relations,
> extends MagicObject {
    public static [CLASS_MARKER] = 'Model';
    public static [SCHEMA]: Schema;
    public static remote: boolean = false;
    private static _hydrating: boolean = false;

    public static get defaultContainerUrl(): string {
        return getMeta(this, 'defaultContainerUrl');
    }

    public static set defaultContainerUrl(value: string) {
        setMeta(this, 'defaultContainerUrl', value);
    }

    public static get modelName(): string {
        return getMeta(this, 'modelName');
    }

    public static boot<T extends typeof Model>(this: T, name?: string): void {
        boot(this, name);
    }

    public static reset(): void {
        reset(this);
    }

    public static useSoftDeletes(enabled: boolean = true): void {
        if (!enabled) {
            modelsUsingSoftDeletes.delete(this);

            return;
        }

        const schema = getSchema(this);

        if (!schema.history || !schema.timestamps) {
            throw new SoukaiError(
                `Can't use soft deletes in ${this.modelName} models, only models with history and timestamps can be soft deleted.`,
            );
        }

        modelsUsingSoftDeletes.add(this);
    }

    public static usesSoftDeletes(): boolean {
        if (modelsUsingSoftDeletes.has(this)) {
            return true;
        }

        return this.remote && modelsUsingSoftDeletes.has(Object.getPrototypeOf(this));
    }

    public static async updateSchema(other: ModelConstructor): Promise<void> {
        replaceSchema(this, updateModelSchema(this, getSchema(other)));

        await emitModelClassEvent(this, 'schema-updated', { schema: other });
    }

    public static hydrating<T>(operation: () => T): T {
        Model._hydrating = true;

        try {
            return operation();
        } finally {
            Model._hydrating = false;
        }
    }

    protected static isHydrating(): boolean {
        return Model._hydrating;
    }

    public static newInstance<T extends Model>(
        this: ModelConstructor<T>,
        attributes?: Record<string, unknown>,
        options?: ModelConstructorOptions,
    ): T {
        return new this(attributes, options);
    }

    public static getEngine(): Engine | undefined {
        return this.remote ? getRemoteEngine() : getEngine();
    }

    public static requireEngine(): Engine {
        return this.remote ? requireRemoteEngine() : requireEngine();
    }

    public static getRDFClasses(): string[] {
        return getSchema(this).rdfClasses.classes.map((rdfClass) => rdfClass.value);
    }

    public static matchesRDFClasses(types: RDFClassesInput): boolean {
        return getSchema(this).rdfClasses.matches(types);
    }

    public static getRelations(): SchemaRelations {
        return getSchema(this).relations;
    }

    public static getRelation(name: string): SchemaRelationDefinition {
        return required(
            getSchema(this).relations[name],
            `Relation '${name}' is not defined in the ${this.modelName} model.`,
        );
    }

    public static hasComputedAttribute(name: string): boolean {
        return name in getSchema(this).computed;
    }

    public static urlFromSlug(slug: string, options: UrlFromSlugOptions = {}): string {
        const documentUrl = this.documentUrlFromSlug(slug, options);
        const resourceHash = getSchema(this).rdfDefaultResourceHash;

        return resourceHash ? `${documentUrl}#${resourceHash}` : documentUrl;
    }

    public static documentUrlFromSlug(slug: string, options: UrlFromSlugOptions = {}): string {
        const schemaSlug = getSchema(this).slug;
        const documentSlug = schemaSlug?.type === 'container' ? `${slug}/${schemaSlug.documentSlug}` : slug;

        return urlResolve(options.containerUrl ?? this.defaultContainerUrl, documentSlug);
    }

    public static slugFromUrl(url: string): string | null {
        const schemaSlug = getSchema(this).slug;
        const targetUrl = schemaSlug?.type === 'container' ? (urlParentDirectory(urlRoute(url)) ?? url) : url;

        return urlRoute(targetUrl).split('/').filter(isTruthy).pop() ?? null;
    }

    public static async find<T extends Model>(
        this: ModelConstructor<T>,
        url: string,
        options: FindOptions = {},
    ): Promise<ModelWithUrl<T> | null> {
        const engine = this.requireEngine();

        try {
            const document = await engine.readDocument(urlRoute(url));
            const model = await this.fromDocument(document).find(url, options);

            return model;
        } catch (error) {
            if (applyStrictChecks() && !isInstanceOf(error, DocumentNotFound) && !isInstanceOf(error, ZodError)) {
                throw error;
            }

            return null;
        }
    }

    public static async findOrFail<T extends Model>(this: ModelConstructor<T>, url: string): Promise<ModelWithUrl<T>> {
        const instance = await this.find(url);

        return instance ?? fail(`Failed getting required model ${url}`);
    }

    public static async all<T extends Model>(
        this: ModelConstructor<T>,
        options: LoadAllOptions = {},
    ): Promise<ModelWithUrl<T>[]> {
        try {
            const documents = await this.requireEngine().readDocuments(
                options.$in
                    ? { urls: options.$in }
                    : {
                          containerUrl: options.from ?? this.defaultContainerUrl,
                          deep: options.deep,
                          depth: options.depth,
                      },
            );

            const models = await Promise.all(
                Object.values(documents).map(async (document) => {
                    try {
                        return await this.fromDocument(document).all({
                            includeSoftDeleted: options.includeSoftDeleted,
                        });
                    } catch (error) {
                        if (!options.onDocumentError) {
                            throw error;
                        }

                        options.onDocumentError(error, document.url);

                        return [];
                    }
                }),
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

    public static async postToContainer<T extends Model>(
        this: ModelConstructor<T>,
        containerUrl: string,
        ...args: ConstructorParameters<ModelConstructor<T>>
    ): Promise<ModelWithUrl<T>> {
        const model = new this(...args);

        return model.save({ containerUrl, postToContainer: true });
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

    public static fromRDF<T extends Model>(
        this: ModelConstructor<T>,
        quads: Quad[],
        options: FromRDFOptions = {},
    ): ModelBuilder<T, false> {
        return ModelBuilder.fromRDF(this, quads, options);
    }

    public static fromTurtle<T extends Model>(
        this: ModelConstructor<T>,
        turtle: string,
        options: FromTurtleOptions = {},
    ): ModelBuilder<T, false> {
        return ModelBuilder.fromTurtle(this, turtle, options);
    }

    public static fromJsonLD<T extends Model>(
        this: ModelConstructor<T>,
        json: JsonLD,
        options: FromJsonLDOptions = {},
    ): ModelBuilder<T, true> {
        return ModelBuilder.fromJsonLD(this, json, options);
    }

    public static fromDocument<T extends Model>(
        this: ModelConstructor<T>,
        document: SolidDocument,
    ): ModelBuilder<T, false> {
        return ModelBuilder.fromDocument(this, document);
    }

    public static async hydrate<T extends Model>(this: ModelConstructor<T>, serialized: SerializedModel): Promise<T> {
        const model = await hydrateModel(serialized);

        if (!isInstanceOf(model, this)) {
            throw new SoukaiError(
                `Failed hydrating ${this.modelName}, serialized model has a different class (${model.static().modelName})`,
            );
        }

        return model;
    }

    public static on<TModel extends Model, TEvent extends ModelInstanceEvent | ModelClassEvent>(
        this: ModelConstructor<TModel>,
        event: TEvent,
        listener: ModelListener<TModel, TEvent>,
    ): () => void {
        return onModelEvent(this, event, listener);
    }

    public static once<TModel extends Model, TEvent extends ModelInstanceEvent | ModelClassEvent>(
        this: ModelConstructor<TModel>,
        event: TEvent,
        listener: ModelListener<TModel, TEvent>,
    ): () => void {
        return onModelEvent(this, event, listener, { once: true });
    }

    public static off(event: ModelInstanceEvent | ModelClassEvent | '*', listener: (payload: never) => unknown): void {
        offModelEvent(this, event, listener);
    }

    public static<T extends ModelConstructor<this>>(): T;
    public static<T extends ModelConstructor<this>, K extends keyof T>(property: K): T[K];
    public static<T extends ModelConstructor<this>, K extends keyof T>(property?: K): T | T[K] {
        // oxlint-disable-next-line typescript/no-explicit-any
        return super.static<any, any>(property);
    }

    declare public url?: string;
    declare public createdAt?: Date;
    declare public updatedAt?: Date;
    declare public metadata?: Metadata;
    declare public relatedMetadata?: HasOneRelation<this, Metadata, typeof Metadata>;
    declare public operations?: Operation[];
    declare public relatedOperations?: HasManyRelation<this, Operation, typeof Operation>;
    declare public tombstone?: Tombstone;
    declare public relatedTombstone?: HasOneRelation<this, Tombstone, typeof Tombstone>;
    declare public [MODEL_TIMESTAMPS_MARKER]?: TimestampFieldName[];

    declare protected _exists: boolean;
    declare protected _documentExists: boolean;
    declare protected _sourceDocumentUrl: string | null;
    declare protected _markedForDeletion: boolean;
    declare protected _pendingSoftDeletion: PendingSoftDeletion | null;
    declare protected _deletedWith: Model[];
    declare protected _attributes: Attributes;
    declare protected _originalAttributes: Attributes;
    declare protected _dirtyAttributes: Set<FieldName>;
    declare protected _malformedAttributes: Set<FieldName> | null;
    declare protected _pendingMalformedAttributeFixes: Set<FieldName> | null;
    declare protected _staleRDFProperties: Set<string> | null;
    declare protected _rdfPrefixAliases: ModelRDFPrefixAliases | null;
    declare protected _computedAttributes: Record<string, ComputedAttribute>;
    declare protected _relations: Record<string, Relation>;
    declare protected _legacyTimestamps: LegacyTimestamps | null;
    declare protected _permissions: ModelPermissions | null;

    public constructor(attributes: Record<string, unknown> = {}, options: ModelConstructorOptions = {}) {
        super(attributes, options);

        if ((this.static() as unknown as typeof Model).isConjuring()) {
            this._attributes = {} as unknown as Attributes;
            this._originalAttributes = {} as unknown as Attributes;
            this._dirtyAttributes = new Set();
            this._malformedAttributes = null;
            this._pendingMalformedAttributeFixes = null;
            this._staleRDFProperties = null;
            this._rdfPrefixAliases = null;
        }
    }

    protected initialize(attributes: Record<string, unknown> = {}, options: ModelConstructorOptions = {}): void {
        const exists = options.exists ?? false;

        this._exists = exists;
        this._documentExists = exists;
        this._sourceDocumentUrl = null;
        this._markedForDeletion = false;
        this._pendingSoftDeletion = null;
        this._deletedWith = [];
        this._computedAttributes = {};
        this._relations = {};
        this._legacyTimestamps = null;
        this._permissions = null;
        this._malformedAttributes = null;
        this._pendingMalformedAttributeFixes = null;
        this._staleRDFProperties = null;
        this._rdfPrefixAliases = null;

        if (Model.isHydrating()) {
            this._attributes = objectDeepClone(attributes) as Attributes;
            this._originalAttributes = (exists ? objectDeepClone(attributes) : {}) as Attributes;
            this._dirtyAttributes = exists ? new Set() : new Set(Object.keys(this._attributes) as FieldName[]);

            return;
        }

        this._attributes = this.parseAttributes(attributes, options);
        this._originalAttributes = (exists ? objectDeepClone(this._attributes) : {}) as Attributes;
        this._dirtyAttributes = exists ? new Set() : new Set(Object.keys(this._attributes) as FieldName[]);

        if ((options.initializeMetadata ?? true) && !isChangeTrackingDisabled()) {
            this.__instance().initializeMetadata();
        }
    }

    public getAttribute(field: FieldName): unknown {
        return this._attributes[field];
    }

    public getAttributes(): Attributes {
        return objectDeepClone(this._attributes);
    }

    public setAttribute(field: FieldName, value: unknown): void {
        this.setAttributes({ [field]: value } as Partial<Attributes>);
    }

    public unsetAttribute(field: FieldName): void {
        this.setAttribute(field, undefined);
    }

    public setAttributes(attributes: Partial<Attributes>): void {
        const newAttributes: Record<string, unknown> = {};
        const shape = getSchema(this.static()).fields.def.shape;
        const modifiedFields: string[] = [];

        for (const [field, value] of Object.entries(attributes)) {
            if (!(field in shape)) {
                continue;
            }

            try {
                const parsedValue = shape[field]?.parse(value);

                if (!this.attributeValueChanged(this._attributes[field], parsedValue)) {
                    continue;
                }

                if (parsedValue === undefined) {
                    delete this._attributes[field];
                    this._dirtyAttributes.add(field as FieldName);
                    modifiedFields.push(field);
                    continue;
                }

                newAttributes[field] = parsedValue;
                modifiedFields.push(field);
            } catch (error) {
                if (error instanceof ZodError) {
                    throw new InvalidAttributeError(this.static('modelName'), field, error);
                }

                throw error;
            }
        }

        Object.assign(this._attributes, newAttributes);
        Object.keys(newAttributes).forEach((field) => this._dirtyAttributes.add(field as FieldName));
        modifiedFields.forEach((field) => {
            this.removeStaleRDFProperties(this.getFieldRDFPropertyValues(field));

            if (this._malformedAttributes?.delete(field as FieldName)) {
                (this._pendingMalformedAttributeFixes ??= new Set()).add(field as FieldName);
            }
        });

        if (this._malformedAttributes?.size === 0) {
            this._malformedAttributes = null;
        }

        for (const field of modifiedFields) {
            // oxlint-disable-next-line typescript/no-floating-promises
            emitModelInstanceEvent(this.__instance(), 'modified', { field });
        }
    }

    public getOriginalAttributes(): Attributes {
        return this._originalAttributes;
    }

    public getOriginalAttribute(field: FieldName): unknown {
        return this._originalAttributes[field];
    }

    public getComputedAttribute(name: string): ComputedAttribute {
        if (!(name in this._computedAttributes)) {
            const definition = getSchema(this.static()).computed[name] as SchemaComputedAttributeDefinition;

            if (!definition) {
                throw new SoukaiError(
                    `Computed attribute '${name}' is not defined in the ${this.static().modelName} model.`,
                );
            }

            this._computedAttributes[name] = new ComputedAttribute(
                this,
                name,
                definition.compute,
                definition.invalidationStrategy,
            );
        }

        return this._computedAttributes[name] as ComputedAttribute;
    }

    public getRelation(name: RelationName): Relation {
        if (!(name in this._relations)) {
            this._relations[name] = createRelation(this.__instance(), name);
        }

        return this._relations[name] as Relation;
    }

    public async loadRelation<K extends RelationName>(name: K): Promise<GetLoadedRelationModels<Relations[K]>> {
        const relation = this.getRelation(name);

        await relation.load();
        await emitModelInstanceEvent(this.__instance(), 'relation-loaded', { relation });

        return relation.related as GetLoadedRelationModels<Relations[K]>;
    }

    public async setRelationModels<K extends RelationName>(
        name: K,
        related: GetLoadedRelationModels<Relations[K]>,
    ): Promise<void> {
        const relation = this.getRelation(name);

        relation.related = related;

        await emitModelInstanceEvent(this.__instance(), 'relation-loaded', { relation });
    }

    public isRelationLoaded(name: RelationName): boolean {
        return this.getRelation(name).loaded;
    }

    public async loadRelationIfUnloaded<K extends RelationName>(
        name: K,
    ): Promise<GetLoadedRelationModels<Relations[K]>> {
        if (!this.isRelationLoaded(name)) {
            await this.loadRelation(name);
        }

        return this.getRelation(name).related as GetLoadedRelationModels<Relations[K]>;
    }

    public async loadComputedAttributes(): Promise<void> {
        await Promise.all(
            this.getMissingComputedAttributes().map((computedAttribute) => computedAttribute.updateValue()),
        );
    }

    public mintUrl(options: MintUrlOptions = {}): string {
        if (!this.url) {
            this.url = this.newUrl(options);

            if (options.documentUrl) {
                this._documentExists = options.documentExists ?? true;
            } else {
                mintedUrls.set(this.__instance(), { url: this.url, options });
            }

            if (this.hasTimestamps() && this.metadata) {
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

    public getSourceDocumentUrl(): string | null {
        return this._sourceDocumentUrl;
    }

    public setSourceDocumentUrl(sourceDocumentUrl: string | null): void {
        this._sourceDocumentUrl = sourceDocumentUrl;
    }

    public getSourceContainerUrl(): string | null {
        const sourceDocumentUrl = this.getSourceDocumentUrl();

        return sourceDocumentUrl ? urlParentDirectory(sourceDocumentUrl) : null;
    }

    public isInAuthoritativeDocument(): boolean | null {
        const documentUrl = this.getDocumentUrl();

        if (!this._sourceDocumentUrl || !documentUrl) {
            return null;
        }

        return this._sourceDocumentUrl === documentUrl;
    }

    public on<TEvent extends ModelInstanceEvent>(
        event: TEvent,
        listener: ModelInstanceListener<this, TEvent>,
    ): () => void {
        return onModelEvent(this.__instance(), event, listener as ModelListener<Model, TEvent>);
    }

    public once<TEvent extends ModelInstanceEvent>(
        event: TEvent,
        listener: ModelInstanceListener<this, TEvent>,
    ): () => void {
        return onModelEvent(this.__instance(), event, listener as ModelListener<Model, TEvent>, { once: true });
    }

    public off(event: ModelInstanceEvent | '*', listener: (payload: never) => unknown): void {
        offModelEvent(this.__instance(), event, listener);
    }

    public async syncOperations(): Promise<void> {
        if (!this.__isCanonical()) {
            return this.__instance().syncOperations();
        }

        this.assertAuthoritativeDocument();

        const { updated } = await syncDocumentOperations(this.requireDocumentUrl());
        const documentModels = objectFromEntries(
            this.getDocumentModels()
                .filter((model) => model.hasUrl())
                .map((model) => [model.url, model]),
        );

        for (const updatedResourceUrl of updated) {
            const documentModel = documentModels[updatedResourceUrl];

            if (!documentModel) {
                continue;
            }

            const freshInstance = await documentModel.fresh();

            documentModel._attributes = freshInstance._attributes;
            documentModel._originalAttributes = freshInstance._originalAttributes;
            documentModel._dirtyAttributes = new Set();
            documentModel._malformedAttributes = freshInstance._malformedAttributes;
            documentModel._pendingMalformedAttributeFixes = null;

            if (freshInstance._relations.metadata?.loaded) {
                documentModel.getRelation('metadata').related = freshInstance._relations.metadata.related;
            }

            await emitModelInstanceEvent(documentModel, 'updated');
            await emitModelInstanceEvent(documentModel, 'saved');
        }
    }

    public requirePublicPermissions(): SolidDocumentPermission[] {
        const { publicPermissions } = this.requirePermissions();

        if (!publicPermissions) {
            throw new SoukaiError(
                `Public permissions for ${this.static('modelName')} model are not available, ` +
                    "the server didn't return a WAC-Allow header.",
            );
        }

        return publicPermissions;
    }

    public requireWACAuthorizations(): ModelWithUrl<ACLAuthorization>[] {
        const permissions = this.requireWACPermissions();

        this.assertWACAuthorizationsLoaded(permissions);

        return permissions.authorizations.filter((authorization) => authorization.exists());
    }

    public requireACPAccessControlResources(): ModelWithUrl<ACPAccessControlResource>[] {
        return this.requireACPPermissions().accessControlResources;
    }

    public newACPAccessControlResource(): ModelWithUrl<ACPAccessControlResource> {
        this.assertAuthoritativeDocument();

        return newACPAccessControlResource(this, this.requireACPPermissions().acr);
    }

    public isPublic(): boolean {
        return this.requirePublicPermissions().includes(SolidDocumentPermissions.Read);
    }

    public isPrivate(): boolean {
        return !this.isPublic();
    }

    public usesWAC(): boolean {
        return this.requireAuthorizationProtocol() === 'wac';
    }

    public usesACP(): boolean {
        return this.requireAuthorizationProtocol() === 'acp';
    }

    public getSlug(): string | null {
        if (!this.url) {
            return null;
        }

        return this.static().slugFromUrl(this.url);
    }

    public requireSlug(): string {
        return this.getSlug() ?? fail(SoukaiError, 'Failed getting required slug');
    }

    public getContainerUrl(): string | null {
        const documentUrl = this.getDocumentUrl();

        return documentUrl ? urlParentDirectory(documentUrl) : null;
    }

    public requireContainerUrl(): string {
        return this.getContainerUrl() ?? fail(SoukaiError, 'Failed getting required container url');
    }

    public getDirtyAttributes(): FieldName[] {
        return Array.from(this._dirtyAttributes);
    }

    public getMalformedAttributes(): FieldName[] {
        return this._malformedAttributes ? Array.from(this._malformedAttributes) : [];
    }

    public hasMalformedAttributes(): boolean {
        return (this._malformedAttributes?.size ?? 0) > 0;
    }

    public fixMalformedAttributes(): void {
        if (!this._malformedAttributes) {
            return;
        }

        this._pendingMalformedAttributeFixes ??= new Set();

        for (const field of this._malformedAttributes) {
            this._dirtyAttributes.add(field);
            this._pendingMalformedAttributeFixes.add(field);
        }

        this._malformedAttributes = null;
    }

    public getDocumentModels(): Model[] {
        const modelsSet = new Set<Model>();

        this.__instance().populateDocumentModels(modelsSet);

        return Array.from(modelsSet);
    }

    public getRelatedModels(): Model[] {
        const modelsSet = new Set<Model>();

        this.__instance().populateRelatedModels(modelsSet);

        return Array.from(modelsSet);
    }

    public getDetachedDocumentModels(): Model[] {
        const documentUrl = this.getDocumentUrl();
        const documentModels = new Set(this.getDocumentModels());
        const detachedModels = new Set<Model>();
        const pendingModels = Array.from(documentModels);

        while (pendingModels.length > 0) {
            const model = required(pendingModels.pop());

            for (const relation of Object.values(model._relations)) {
                for (const detachedModel of relation[DETACHED_MODELS] ?? []) {
                    if (!detachedModel.exists() || !isUsingSameDocument(documentUrl, relation, detachedModel)) {
                        continue;
                    }

                    for (const detachedDocumentModel of detachedModel.getDocumentModels()) {
                        if (
                            documentModels.has(detachedDocumentModel) ||
                            detachedModels.has(detachedDocumentModel) ||
                            (detachedModel.isMarkedForDeletion() && !detachedDocumentModel.exists())
                        ) {
                            continue;
                        }

                        detachedModels.add(detachedDocumentModel);
                        pendingModels.push(detachedDocumentModel);
                    }
                }
            }
        }

        return Array.from(detachedModels);
    }

    public getDirtyDocumentModels(): Model[] {
        const models = this.getSavedDocumentModels();
        const deletedCrdtModels = getDeletedModelsCrdtModels(models);

        return models.filter((model) => !deletedCrdtModels.has(model) && model.isDirty(undefined, true));
    }

    public isDirty(field?: FieldName, ignoreRelations?: boolean): boolean {
        if (field) {
            return this._dirtyAttributes.has(field);
        }

        if (ignoreRelations) {
            return this._markedForDeletion
                ? this.exists()
                : this._dirtyAttributes.size > 0 || this._pendingSoftDeletion !== null;
        }

        return this.getDirtyDocumentModels().length > 0;
    }

    public cleanDirty(): void {
        this._pendingSoftDeletion = null;

        if (this._rdfPrefixAliases) {
            for (const field of this._dirtyAttributes) {
                for (const property of this.getFieldRDFPropertyValues(field)) {
                    this._rdfPrefixAliases.properties.delete(property);
                }
            }

            if (!this._rdfPrefixAliases.classes && this._rdfPrefixAliases.properties.size === 0) {
                this._rdfPrefixAliases = null;
            }
        }

        this._dirtyAttributes.clear();
        this._pendingMalformedAttributeFixes = null;
        this._originalAttributes = objectDeepClone(this._attributes);
    }

    public usesRDFPrefixAliases(): boolean {
        return this._rdfPrefixAliases !== null;
    }

    public hasTimestamps(): this is ModelWithTimestamps<this, never> {
        return !!getSchema(this.static()).timestamps;
    }

    public hasTimestamp<T extends TimestampField>(field: T): this is ModelWithTimestamps<this, T> {
        return (getSchema(this.static()).timestamps || []).includes(field);
    }

    public hasUrl(): this is ModelWithUrl<this> {
        return this.url !== undefined;
    }

    public tracksChanges(): this is ModelWithHistory<this> {
        return getSchema(this.static()).history;
    }

    public leavesTombstones(): this is ModelWithTombstones<this> {
        return getSchema(this.static()).tombstone;
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

    public markForDeletion(): void {
        this._markedForDeletion = true;
    }

    public unmarkForDeletion(): void {
        this._markedForDeletion = false;
    }

    public isMarkedForDeletion(): boolean {
        return this._markedForDeletion;
    }

    public isSoftDeleted(): boolean {
        if (this._pendingSoftDeletion) {
            return this._pendingSoftDeletion === 'soft-delete';
        }

        return !!(this._relations.metadata?.related as Metadata | undefined)?.deletedAt;
    }

    public getPendingSoftDeletion(): PendingSoftDeletion | null {
        return this._pendingSoftDeletion;
    }

    public async softDelete(): Promise<this> {
        if (!this.__isCanonical()) {
            await this.__instance().softDelete();

            return this;
        }

        return this.updateSoftDeletion('soft-delete');
    }

    public async restore(): Promise<this> {
        if (!this.__isCanonical()) {
            await this.__instance().restore();

            return this;
        }

        return this.updateSoftDeletion('restore');
    }

    public async delete(): Promise<this> {
        if (!this.__isCanonical()) {
            await this.__instance().delete();

            return this;
        }

        if (this.exists() && this.static().usesSoftDeletes()) {
            return this.softDelete();
        }

        return this.forceDelete();
    }

    public async forceDelete(): Promise<this> {
        if (!this.__isCanonical()) {
            await this.__instance().forceDelete();

            return this;
        }

        if (!this.exists()) {
            return this;
        }

        await this.performDelete();

        return this;
    }

    public async save(options: SaveOptions = {}): Promise<ModelWithUrl<this>> {
        const { containerUrl } = options;

        if (!this.__isCanonical()) {
            await this.__instance().save(options);

            return this as ModelWithUrl<this>;
        }

        const postToContainer = options.postToContainer ?? this.postsToContainer();

        if (postToContainer && this._documentExists) {
            throw new SoukaiError(`Can't post model to container, its document already exists (${this.url})`);
        }

        if (postToContainer && containerUrl && this.url && this.getContainerUrl() !== containerUrl) {
            throw new SoukaiError(`Can't post model to container ${containerUrl}, its url is ${this.url}`);
        }

        if (this._markedForDeletion && !this.exists()) {
            this._markedForDeletion = false;

            return this as ModelWithUrl<this>;
        }

        if (this.exists() && !this.isDirty()) {
            return this;
        }

        this.assertAuthoritativeDocument();

        const cascadedModels = await cascadeDeletesInDocument(this.getDocumentModelsPendingDeletion());

        try {
            await this.saveDocumentModels({ ...options, postToContainer, date: options.date ?? new Date() });
        } finally {
            cascadedModels.forEach((model) => model.unmarkForDeletion());
        }

        return this as ModelWithUrl<this>;
    }

    public async migrateSchema<T extends ModelConstructor>(schema: T): Promise<ModelWithUrl<ModelInstanceType<T>>> {
        if (!this.__isCanonical()) {
            return this.__instance().migrateSchema(schema);
        }

        this.assertAuthoritativeDocument();

        return (await migrateSchema(this, schema)) as ModelWithUrl<ModelInstanceType<T>>;
    }

    public update(attributes: Partial<Attributes>): Promise<ModelWithUrl<this>> {
        this.setAttributes(attributes);

        return this.save();
    }

    public touch(now?: Nullable<Date>): void {
        if (!this.hasTimestamps()) {
            return;
        }

        now ??= new Date();

        if (!this.metadata) {
            this.initializeMetadata({ createdAt: this._legacyTimestamps?.createdAt ?? now, updatedAt: now });
        } else {
            this.exists() || !this.hasTimestamp('createdAt') || this.metadata.setAttribute('createdAt', now);
            this.hasTimestamp('updatedAt') && this.metadata.setAttribute('updatedAt', now);
        }

        if (this._pendingSoftDeletion) {
            this.metadata.setAttribute('deletedAt', this._pendingSoftDeletion === 'soft-delete' ? now : undefined);
        }
    }

    public async fresh(): Promise<this> {
        if (!this.url) {
            throw new SoukaiError(`Couldn't get fresh ${this.static('modelName')} instance, url missing.`);
        }

        const sourceDocumentUrl = this.getSourceDocumentUrl();
        const freshInstance =
            sourceDocumentUrl && this.isInAuthoritativeDocument() === false
                ? await this.static()
                      .fromDocument(await this.static().requireEngine().readDocument(sourceDocumentUrl))
                      .find(this.url, { includeSoftDeleted: true })
                : await this.static().find(this.url, { includeSoftDeleted: true });

        if (!freshInstance) {
            throw new SoukaiError(`Couldn't get fresh ${this.static('modelName')} instance with url '${this.url}'.`);
        }

        return freshInstance as this;
    }

    public async register(typeIndex: string | TypeIndex): Promise<void> {
        const typeIndexInstance = await resolveTypeIndex(typeIndex);

        await typeIndexInstance.registerInstance(this);
    }

    public async fetchPermissions(options: FetchPermissionsOptions = {}): Promise<ModelPermissions> {
        this.assertAuthoritativeDocument('Fetching permissions of');

        this._permissions = await fetchPermissions(this, options);

        return this._permissions;
    }

    public async fetchPermissionsIfMissing(options: FetchPermissionsOptions = {}): Promise<ModelPermissions> {
        return this._permissions ?? (await this.fetchPermissions(options));
    }

    public async updatePublicPermissions(permissions: SolidDocumentPermission[]): Promise<void> {
        this.assertAuthoritativeDocument();

        await updatePublicPermissions(this.requireDocumentUrl(), permissions);
        await this.fetchPermissions();
    }

    public async createWACAuthorization(input: WACAuthorizationInput): Promise<ModelWithUrl<ACLAuthorization>> {
        this.assertAuthoritativeDocument();
        this.assertWACAuthorizationsLoaded(this.requireWACPermissions());

        const url = await createWACAuthorization(this.requireDocumentUrl(), input);

        await this.fetchPermissions();

        return (
            this.requireWACAuthorizations().find((authorization) => authorization.url === url) ??
            fail(SoukaiError, `Failed creating WAC authorization for ${this.requireDocumentUrl()}`)
        );
    }

    public serialize(): SerializedModel {
        return serializeModel(this);
    }

    public async toRDF(): Promise<Quad[]> {
        await loadDocumentRelations(this);

        return serializeToRDF(this.getDocumentModels());
    }

    public async toJsonLD(): Promise<JsonLD> {
        return quadsToJsonLD(await this.toRDF());
    }

    public async toTurtle(): Promise<string> {
        return quadsToTurtle(await this.toRDF());
    }

    protected __get(property: string): unknown {
        if (property in this._attributes) {
            return this._attributes[property];
        }

        if ((property === 'createdAt' || property === 'updatedAt') && this.hasTimestamp(property)) {
            return (
                (this._relations.metadata?.related as Metadata)?._attributes[property] ??
                this._legacyTimestamps?.[property]
            );
        }

        if (property in getSchema(this.static()).relations) {
            return this.__instance().getRelation(property as RelationName)?.related;
        }

        if (property in getSchema(this.static()).computed) {
            return this.__instance().getComputedAttribute(property);
        }

        if (property.startsWith('related')) {
            const relation = stringToCamelCase(property.slice(7)) as RelationName;

            if (relation in getSchema(this.static()).relations) {
                return this.__instance().getRelation(relation);
            }
        }

        return super.__get(property);
    }

    protected __set(property: string, value: unknown): void {
        if (this.isField(property)) {
            this.setAttribute(property, value);

            return;
        }

        this.assertWritableProperty(property, 'set');

        super.__set(property, value);
    }

    protected __delete(property: string): void {
        if (this.isField(property)) {
            this.setAttribute(property, undefined);

            return;
        }

        this.assertWritableProperty(property, 'delete');

        super.__delete(property);
    }

    protected __has(property: string): boolean {
        return this.isField(property);
    }

    protected attributeValueChanged(originalValue: unknown, newValue: unknown): boolean {
        return !deepEquals(originalValue ?? null, newValue ?? null);
    }

    protected newUrl(options: MintUrlOptions = {}): string {
        const documentUrl = options.documentUrl ?? this.newUrlDocumentUrl(options);
        const resourceHash = options.resourceHash ?? getSchema(this.static()).rdfDefaultResourceHash;

        return resourceHash ? `${documentUrl}#${resourceHash}` : documentUrl;
    }

    protected newUrlSlug(): string | null {
        const slugField = getSchema(this.static()).slug?.field as FieldName | undefined;
        const slugFieldValue = slugField && this.getAttribute(slugField);

        return slugFieldValue ? stringToSlug(String(slugFieldValue)) : null;
    }

    protected newUrlDocumentUrl(options: MintUrlOptions = {}): string {
        if (!getSchema(this.static()).mintsUrls) {
            return this.newProvisionalDocumentUrl(options);
        }

        const slug = this.newUrlSlug() ?? uuid();

        return this.static().documentUrlFromSlug(`${slug}${options.slugSuffix ?? ''}`, options);
    }

    protected newProvisionalDocumentUrl(options: MintUrlOptions = {}): string {
        return urlResolve(
            options.containerUrl ?? this.static().defaultContainerUrl,
            `${uuid()}${options.slugSuffix ?? ''}`,
        );
    }

    protected mintUniqueUrl(options: MintUrlOptions): void {
        const documentUrl = this.requireDocumentUrl();
        const relatedModels = this.getRelatedModels();

        this.url = undefined;
        this.mintUrl({ ...options, slugSuffix: `-${shortId()}` });
        this.replaceMintedDocumentUrl(relatedModels, documentUrl, this.requireDocumentUrl());
    }

    protected moveToDocument(documentUrl: string): void {
        const previousDocumentUrl = this.requireDocumentUrl();
        const relatedModels = this.getRelatedModels();

        this.url = documentUrl + this.requireUrl().slice(previousDocumentUrl.length);
        this.replaceMintedDocumentUrl(relatedModels, previousDocumentUrl, documentUrl);
    }

    protected replaceMintedDocumentUrl(relatedModels: Model[], documentUrl: string, newDocumentUrl: string): void {
        const isMintedDocumentUrl = (value: unknown, originalValue: unknown): value is string =>
            isString(value) &&
            (value === documentUrl || value.startsWith(`${documentUrl}#`)) &&
            !arrayFrom(originalValue).includes(value);
        const replaceValue = (value: unknown, originalValue: unknown) =>
            isMintedDocumentUrl(value, originalValue) ? newDocumentUrl + value.slice(documentUrl.length) : value;

        for (const relatedModel of relatedModels) {
            const updatedAttributes = Object.entries(relatedModel._attributes)
                .map(([field, value]) => {
                    const originalValue = relatedModel._originalAttributes[field];

                    return [
                        field,
                        Array.isArray(value)
                            ? value.map((item) => replaceValue(item, originalValue))
                            : replaceValue(value, originalValue),
                    ] as const;
                })
                .filter(([field, value]) => !deepEquals(relatedModel._attributes[field], value));

            if (updatedAttributes.length === 0) {
                continue;
            }

            relatedModel.setAttributes(objectFromEntries(updatedAttributes));
        }
    }

    protected async performDelete(options: PerformDeleteOptions = {}): Promise<void> {
        const { deletedWith = [], deletingUrls = new Set<string>(), date = new Date() } = options;
        const deletedModels = [this, ...deletedWith];
        let markedModels: Model[] = [];

        this.assertAuthoritativeDocument();

        try {
            deletedModels.forEach((model) => markForDeletion(model, deletingUrls));

            const detachedDeletedModels = this.getDetachedDocumentModels().filter(
                (model) => model.isMarkedForDeletion() && model.exists(),
            );

            detachedDeletedModels.forEach((model) => markForDeletion(model, deletingUrls));

            const cascade = await cascadeDeletes([...deletedModels, ...detachedDeletedModels], deletingUrls);

            markedModels = cascade.markedModels;

            await deleteModels(cascade.otherDocumentModels, { deletingUrls, date });

            this._deletedWith = [...deletedWith, ...markedModels];

            await this.save({ date });
        } finally {
            this._deletedWith = [];

            deletedModels.concat(markedModels).forEach((model) => model.unmarkForDeletion());
        }
    }

    protected getSavedDocumentModels(): Model[] {
        return arrayUnique([
            ...this.getDocumentModels(),
            ...this.getDetachedDocumentModels(),
            ...this._deletedWith.flatMap((model) => model.getDocumentModels()),
        ]);
    }

    protected getDocumentModelsPendingDeletion(): Model[] {
        return this.getSavedDocumentModels().filter((model) => model._markedForDeletion && model.exists());
    }

    protected async saveDocumentModels(options: SaveOptions = {}): Promise<void> {
        const thisExisted = this.exists();
        const dirtyDocumentModels = this.getDirtyDocumentModels();
        const dirtyDocumentModelsExisted = dirtyDocumentModels.map((model) => model.exists());

        assertMutableModels(dirtyDocumentModels, this.static().getEngine());

        for (const model of dirtyDocumentModels) {
            if (model._markedForDeletion) {
                continue;
            }

            await getSchema(model.static()).hooks.beforeSave?.call(model);
        }

        await this.beforeSave({ containerUrl: options.containerUrl, date: options.date });
        await this.performSave(options);
        await this.afterSave();

        for (let index = 0; index < dirtyDocumentModels.length; index++) {
            const model = required(dirtyDocumentModels[index]);
            const existed = dirtyDocumentModelsExisted[index];

            if (model._markedForDeletion) {
                await emitModelInstanceEvent(model, 'deleted');

                model._markedForDeletion = false;

                continue;
            }

            await emitModelInstanceEvent(model, existed ? 'updated' : 'created');
            await emitModelInstanceEvent(model, 'saved');
        }

        if (!dirtyDocumentModels.includes(this)) {
            await emitModelInstanceEvent(this, thisExisted ? 'updated' : 'created');
            await emitModelInstanceEvent(this, 'saved');
        }
    }

    protected postsToContainer(): boolean {
        if (getSchema(this.static()).mintsUrls || this._documentExists) {
            return false;
        }

        return !this.url || mintedUrls.get(this)?.url === this.url;
    }

    protected async beforeSave(options: BeforeSaveOptions = {}): Promise<void> {
        const { date, ...mintUrlOptions } = options;

        this.mintUrl(mintUrlOptions);

        const documentUrl = this.requireDocumentUrl();
        const documentExists = this._documentExists;
        const documentModels = this.getDocumentModels();

        for (const documentModel of documentModels) {
            documentModel.mintUrl({ documentUrl, documentExists, resourceHash: uuid() });
        }

        for (const documentModel of this.getSavedDocumentModels()) {
            if (documentModel._markedForDeletion || !documentModel.isDirty()) {
                continue;
            }

            if (!isChangeTrackingDisabled()) {
                documentModel.touch(date);
            }

            for (const relation of Object.values(documentModel._relations)) {
                relation.getLoadedModels().forEach((model) => relation.setForeignAttributes(model));
            }
        }
    }

    protected async performSave(options: SaveOptions = {}): Promise<void> {
        const date = options.date ?? new Date();
        const engine: Engine<object, LocalEngineWriteOptions> = this.static().requireEngine();
        const localEngine = isLocalEngine(engine) ? engine : null;

        if (this._documentExists) {
            const documentUrl = this.requireDocumentUrl();
            const dirtyDocumentModels = this.getDirtyDocumentModels();
            const updatedModels = dirtyDocumentModels.filter((model) => !model._markedForDeletion);
            const deletedModels = dirtyDocumentModels.filter(
                (model): model is ModelWithUrl<Model> => model._markedForDeletion && model.exists(),
            );

            if (!isChangeTrackingDisabled()) {
                await loadDocumentRelations(this, { models: updatedModels, relations: ['operations'] });
            }

            const createdModels = updatedModels.filter((model) => !model.exists());
            const documentLocalChanges =
                localEngine &&
                (deletedModels.length > 0 || createdModels.some((model) => recordsLocalChanges(model, localEngine)))
                    ? await localEngine.getDocumentLocalChanges(documentUrl)
                    : null;
            const locallyDeletedModels = deletedModels.filter(
                (model) => recordsLocalChanges(model, localEngine) && !isCreatedLocally(model, documentLocalChanges),
            );
            const restoredModels = createdModels.filter(
                (model) => recordsLocalChanges(model, localEngine) && isDeletedLocally(model, documentLocalChanges),
            );

            assertRestorableModels(restoredModels);

            const removedModels = deletedModels.filter((model) => !locallyDeletedModels.includes(model));
            const document = deletedModels.length > 0 ? await engine.readDocument(documentUrl) : null;

            if (
                document &&
                updatedModels.length === 0 &&
                locallyDeletedModels.length === 0 &&
                !hasLocalDeletions(documentLocalChanges) &&
                deletingModelsEmptiesDocument(deletedModels, document, (model) =>
                    recordsLocalChanges(model, localEngine),
                )
            ) {
                await engine.deleteDocument(documentUrl);

                return;
            }

            const newOperations = new Map<string, string[]>();
            const deleteOperations = document
                ? getDeleteModelsOperations(deletedModels, document, date, (model) =>
                      recordsLocalChanges(model, localEngine),
                  )
                : [];
            const updateOperations = getDirtyDocumentsUpdates({ updatedModels, restoredModels, newOperations, date });
            const localChanges =
                localEngine &&
                updatedModelsLocalChanges({
                    date,
                    updatedModels,
                    removedModels,
                    restoredModels,
                    newOperations,
                    deletedOperations: new Map(
                        locallyDeletedModels.map((model) => [
                            model.url,
                            getResourceOperationUrls(required(document), model.url),
                        ]),
                    ),
                });

            await engine.updateDocument(
                documentUrl,
                [...updateOperations, ...deleteOperations],
                localChanges ? { localChanges } : undefined,
            );
        } else if (options.postToContainer) {
            const postDocument = async () => {
                const documentUrl = this.requireDocumentUrl();
                const documentModels = this.getDocumentModels().filter((model) => !model._markedForDeletion);
                const localChanges = localEngine && createdModelsLocalChanges(documentModels, date);
                const mintsUrls = getSchema(this.static()).mintsUrls;
                const quads = serializeToRDF(documentModels);
                const document = await engine.createDocumentInContainer(
                    this.requireContainerUrl(),
                    mintsUrls ? quads : convertToRelativeQuads(quads, documentUrl),
                    { localChanges, proposedUrl: mintsUrls ? documentUrl : null },
                );

                if (document.url !== documentUrl) {
                    this.moveToDocument(document.url);
                }
            };

            try {
                await postDocument();
            } catch (error) {
                if (!isInstanceOf(error, DocumentAlreadyExists)) {
                    throw error;
                }

                this.moveToDocument(`${this.requireDocumentUrl()}-${shortId()}`);

                await postDocument();
            }
        } else {
            const createDocument = async () => {
                const documentModels = this.getDocumentModels().filter((model) => !model._markedForDeletion);
                const localChanges = localEngine && createdModelsLocalChanges(documentModels, date);

                await engine.createDocument(
                    this.requireDocumentUrl(),
                    serializeToRDF(documentModels),
                    localChanges ? { localChanges } : undefined,
                );
            };

            try {
                await createDocument();
            } catch (error) {
                if (!isInstanceOf(error, DocumentAlreadyExists)) {
                    throw error;
                }

                const mintedUrl = mintedUrls.get(this);
                const isContainer = this.requireDocumentUrl().endsWith('/');
                const isInDocument = this.getDocumentModels().some(
                    (model) => !model._markedForDeletion && !!model.url && error.document.contains(model.url),
                );

                if (!isContainer && mintedUrl && mintedUrl.url === this.url) {
                    this.mintUniqueUrl(mintedUrl.options);

                    await createDocument();

                    return;
                }

                if (!isContainer && isInDocument) {
                    throw error;
                }

                this._documentExists = true;

                await this.performSave({ date });
            }
        }
    }

    protected async afterSave(): Promise<void> {
        const documentUrl = this.requireDocumentUrl();
        const savedModels = this.getSavedDocumentModels();
        const relatedModels = this.getRelatedModels();
        const deletedCrdtModels = getDeletedModelsCrdtModels(savedModels);

        for (const savedModel of savedModels) {
            savedModel.cleanDirty();

            if (savedModel._markedForDeletion || deletedCrdtModels.has(savedModel)) {
                savedModel.setExists(false);

                continue;
            }

            if (!savedModel.exists()) {
                initializeEmptyDocumentRelations(savedModel);
            }

            savedModel.setExists(true);
            savedModel.setDocumentExists(true);
            savedModel.setSourceDocumentUrl(documentUrl);
            mintedUrls.delete(savedModel);
        }

        for (const savedModel of savedModels) {
            for (const relation of Object.values(savedModel._relations)) {
                relation[DETACHED_MODELS] = relation[DETACHED_MODELS]?.filter(
                    (model) => model.exists() && !savedModels.includes(model),
                );
            }
        }

        await refreshComputedAttributes(relatedModels);
    }

    protected initializeMetadata(timestamps: { createdAt?: Date; updatedAt?: Date } = {}): void {
        if (!this.hasTimestamps()) {
            return;
        }

        const metadata = this.relatedMetadata.attach({
            resourceUrl: this.url,
            createdAt: this.hasTimestamp('createdAt') ? (timestamps.createdAt ?? new Date()) : undefined,
            updatedAt: this.hasTimestamp('updatedAt') ? (timestamps.updatedAt ?? new Date()) : undefined,
        });

        this.url && metadata.mintUrl();
    }

    protected initializeLegacyTimestamps(quads: Quad[]): void {
        if (!this.hasTimestamps() || this.metadata) {
            return;
        }

        const legacyDate = (predicate: string) => {
            const variants = getRDFIRIVariants(predicate);
            const quad = quads.find((q) => q.subject.value === this.url && variants.includes(q.predicate.value));
            const date = quad && new Date(quad.object.value);

            return date && !isNaN(date.getTime()) ? date : undefined;
        };

        const createdAt = legacyDate(PURL_CREATED);
        const updatedAt = legacyDate(PURL_MODIFIED) ?? createdAt;

        this._legacyTimestamps = { createdAt, updatedAt };
    }

    protected async restoreComputedAttributes(): Promise<void> {
        await Promise.all(
            this.getMissingComputedAttributes().map((computedAttribute) =>
                computedAttribute.updateValue({ refresh: false, useCache: true, loadRelations: false }),
            ),
        );
    }

    protected getMissingComputedAttributes(): ComputedAttribute[] {
        return Object.keys(getSchema(this.static()).computed)
            .map((name) => this.getComputedAttribute(name))
            .filter((computedAttribute) => computedAttribute.value === undefined);
    }

    protected async updateSoftDeletion(pendingSoftDeletion: PendingSoftDeletion): Promise<this> {
        const action = pendingSoftDeletion === 'soft-delete' ? 'soft delete' : 'restore';

        if (!this.tracksChanges() || !this.hasTimestamps()) {
            throw new SoukaiError(
                `Can't ${action} ${this.static('modelName')} models, only models with history and timestamps can be soft deleted.`,
            );
        }

        if (isChangeTrackingDisabled()) {
            throw new SoukaiError(
                `Can't ${action} ${this.static('modelName')} models while change tracking is disabled.`,
            );
        }

        if (!this.exists()) {
            throw new SoukaiError(`Can't ${action} a ${this.static('modelName')} model that doesn't exist.`);
        }

        if (this.isSoftDeleted() === (pendingSoftDeletion === 'soft-delete')) {
            return this;
        }

        const metadata = this.metadata;

        if (!metadata) {
            throw new SoukaiError(
                `Can't ${action} ${this.static('modelName')} model, its metadata hasn't been initialized.`,
            );
        }
        const previousDeletedAt = metadata.deletedAt;
        const deletedAtWasDirty = metadata.isDirty('deletedAt');

        this._pendingSoftDeletion = pendingSoftDeletion;

        try {
            await this.save();
        } catch (error) {
            metadata.setAttribute('deletedAt', previousDeletedAt);
            deletedAtWasDirty || metadata._dirtyAttributes.delete('deletedAt');

            throw error;
        } finally {
            this._pendingSoftDeletion = null;
        }

        return this;
    }

    private parseAttributes(values: Record<string, unknown>, options: ModelConstructorOptions): Attributes {
        try {
            const attributes = getSchema(this.static()).fields.parse(
                this.preprocessAttributes(values, options),
            ) as Attributes;

            for (const [field, value] of Object.entries(attributes)) {
                if (value !== undefined) {
                    continue;
                }

                delete attributes[field];
            }

            return attributes;
        } catch (error) {
            if (error instanceof ZodError) {
                throw new InvalidAttributesError(this.static('modelName'), error);
            }

            throw error;
        }
    }

    protected addStaleRDFProperties(properties: string[]): void {
        if (properties.length === 0) {
            return;
        }

        this._staleRDFProperties ??= new Set();

        properties.forEach((property) => this._staleRDFProperties?.add(property));
    }

    protected removeStaleRDFProperties(properties: string[]): void {
        if (!this._staleRDFProperties) {
            return;
        }

        properties.forEach((property) => this._staleRDFProperties?.delete(property));

        if (this._staleRDFProperties.size === 0) {
            this._staleRDFProperties = null;
        }
    }

    protected setRDFPrefixAliasesInUse(classes: boolean, properties: string[]): void {
        if (!classes && properties.length === 0) {
            this._rdfPrefixAliases = null;

            return;
        }

        this._rdfPrefixAliases = {
            classes,
            properties: new Set(properties),
        };
    }

    protected assertAuthoritativeDocument(action?: string): void {
        if (this.isInAuthoritativeDocument() !== false) {
            return;
        }

        throw new NonAuthoritativeDocument(
            this.url ?? fail(SoukaiError, 'Failed getting required url'),
            this._sourceDocumentUrl ?? fail(SoukaiError, 'Failed getting required source document url'),
            action,
        );
    }

    private requirePermissions(): ModelPermissions {
        if (!this._permissions) {
            throw new SoukaiError(`Permissions for ${this.static('modelName')} model haven't been loaded.`);
        }

        return this._permissions;
    }

    private requireAuthorizationProtocol(): AuthorizationProtocol {
        const { protocol } = this.requirePermissions();

        if (protocol === 'unknown') {
            throw new SoukaiError(
                `Authorization protocol for ${this.static('modelName')} model is unknown, ` +
                    "the access control documents couldn't be read.",
            );
        }

        return protocol;
    }

    private requireWACPermissions(): Extract<ModelPermissions, { protocol: 'wac' }> {
        const permissions = this.requirePermissions();

        if (permissions.protocol !== 'wac') {
            throw new SoukaiError(`${this.static('modelName')} model isn't using WAC.`);
        }

        return permissions;
    }

    private assertWACAuthorizationsLoaded(
        permissions: Extract<ModelPermissions, { protocol: 'wac' }>,
    ): asserts permissions is Extract<ModelPermissions, { protocol: 'wac' }> & {
        authorizations: ModelWithUrl<ACLAuthorization>[];
    } {
        if (permissions.authorizations) {
            return;
        }

        throw new SoukaiError(
            `WAC authorizations for ${this.static('modelName')} model are not available, ` +
                "the access control document couldn't be read.",
        );
    }

    private requireACPPermissions(): Extract<ModelPermissions, { protocol: 'acp' }> {
        const permissions = this.requirePermissions();

        if (permissions.protocol !== 'acp') {
            throw new SoukaiError(`${this.static('modelName')} model isn't using ACP.`);
        }

        return permissions;
    }

    private isField(property: string): property is FieldName {
        return property in getSchema(this.static()).fields.def.shape;
    }

    private isMagicProperty(property: string): boolean {
        const schema = getSchema(this.static());

        return (
            ((property === 'createdAt' || property === 'updatedAt') && this.hasTimestamp(property)) ||
            property in schema.relations ||
            property in schema.computed ||
            (property.startsWith('related') && stringToCamelCase(property.slice(7)) in schema.relations)
        );
    }

    private assertWritableProperty(property: string, operation: 'set' | 'delete'): void {
        if (!this.isMagicProperty(property)) {
            return;
        }

        throw new SoukaiError(
            `Cannot ${operation} '${property}' on ${this.static('modelName')} model, it's a read-only magic property.`,
        );
    }

    private getFieldRDFPropertyValues(field: string): string[] {
        return getFieldRDFProperties(this.static(), field).map((property) => property.value);
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
                relation[NEW_MODEL] &&
                isUsingSameDocument(documentUrl, relation, relation[NEW_MODEL])
            ) {
                relation[NEW_MODEL].populateDocumentModels(documentModels);
            }

            if (isMultiModelRelation(relation)) {
                for (const newModel of relation[NEW_MODELS] ?? []) {
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

    private populateRelatedModels(relatedModels: Set<Model>): void {
        if (relatedModels.has(this)) {
            return;
        }

        relatedModels.add(this);

        for (const relation of Object.values(this._relations)) {
            if (isSingleModelRelation(relation) && relation[NEW_MODEL]) {
                relation[NEW_MODEL].populateRelatedModels(relatedModels);
            }

            if (isMultiModelRelation(relation)) {
                relation[NEW_MODELS]?.map((model) => model.populateRelatedModels(relatedModels));
            }

            relation.getLoadedModels().forEach((model) => model.populateRelatedModels(relatedModels));
        }
    }

    private preprocessAttributes(
        original: Record<string, unknown>,
        options: ModelConstructorOptions,
    ): Record<string, unknown> {
        const { beforeInitialize } = getSchema(this.static()).hooks;

        if (!beforeInitialize) {
            return original;
        }

        const attributes = objectDeepClone(original);

        beforeInitialize(attributes, { quads: options.source ?? undefined });

        if (!options.exists) {
            return attributes;
        }

        for (const field of arrayUnique([...Object.keys(original), ...Object.keys(attributes)])) {
            if (!this.attributeValueChanged(original[field], attributes[field])) {
                continue;
            }

            this.addStaleRDFProperties(this.getFieldRDFPropertyValues(field));
        }

        return attributes;
    }
}
