import {
    Semaphore,
    applyStrictChecks,
    arrayFilter,
    arrayFrom,
    arrayReplace,
    arrayUnique,
    assert,
    fail,
    invert,
    isInstanceOf,
    map,
    mixed,
    objectWithoutEmpty,
    requireUrlParentDirectory,
    shortId,
    stringToSlug,
    tap,
    toString,
    urlClean,
    urlParentDirectory,
    urlParse,
    urlResolve,
    urlRoot,
    urlRoute,
    uuid,
    when,
} from '@noeldemartin/utils';
import {
    DocumentAlreadyExists,
    DocumentNotFound,
    FieldType,
    InvalidModelDefinition,
    Model,
    ModelKey,
    SoukaiError,
    TimestampField,
    requireBootedModel,
} from 'soukai';
import {
    expandIRI,
    jsonldToQuads,
    mintJsonLDIdentifiers,
    parseResourceSubject,
    quadsToTurtle,
} from '@noeldemartin/solid-utils';
import type {
    Attributes,
    BootedFieldsDefinition,
    EngineAttributeUpdateOperation,
    EngineAttributeValue,
    EngineDocument,
    EngineFilters,
    EngineUpdates,
    Key,
    ModelCastAttributeOptions,
    ModelConstructor,
    MultiModelRelation,
    Relation,
    SchemaDefinition,
    SingleModelRelation,
    TimestampFieldValue,
} from 'soukai';
import type { Fetch, JsonLD, JsonLDGraph, SubjectParts } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import IncompleteDocument from 'soukai-solid/errors/IncompleteDocument';
import IRI from 'soukai-solid/solid/utils/IRI';
import RDFDocument from 'soukai-solid/solid/RDFDocument';
import ResourceNotFound from 'soukai-solid/errors/ResourceNotFound';
import type { SolidEngine } from 'soukai-solid/engines/SolidEngine';
import { usingExperimentalActivityPods } from 'soukai-solid/experimental';
import type RDFResource from 'soukai-solid/solid/RDFResource';

import { hasBeforeParentCreateHook, isSolidDocumentRelation, isSolidHasRelation } from './relations/guards';
import { isSolidMultiModelDocumentRelation, isSolidSingleModelDocumentRelation } from './relations/cardinality-guards';
import type {
    RDFContexts,
    SolidBootedFieldDefinition,
    SolidBootedFieldsDefinition,
    SolidFieldsDefinition,
    SolidSchemaDefinition,
} from './fields';
import DeletesModels from './mixins/DeletesModels';
import DocumentContainsManyRelation from './relations/DocumentContainsManyRelation';
import ManagesPermissions from './mixins/ManagesPermissions';
import MigratesSchemas from './mixins/MigratesSchemas';
import OperationsRelation from './relations/OperationsRelation';
import SerializesToJsonLD from './mixins/SerializesToJsonLD';
import SolidACLAuthorizationsRelation from './relations/SolidACLAuthorizationsRelation';
import SolidBelongsToManyRelation from './relations/SolidBelongsToManyRelation';
import SolidBelongsToOneRelation from './relations/SolidBelongsToOneRelation';
import SolidHasManyRelation from './relations/SolidHasManyRelation';
import SolidHasOneRelation from './relations/SolidHasOneRelation';
import SolidIsContainedByRelation from './relations/SolidIsContainedByRelation';
import TombstoneRelation from './relations/TombstoneRelation';
import TracksHistory, { synchronizeModels } from './mixins/TracksHistory';
import { getSchemaUpdateContext, startSchemaUpdate, stopSchemaUpdate } from './internals/helpers';
import { inferFieldDefinition, isSolidArrayFieldDefinition } from './fields';
import type Metadata from './history/Metadata';
import type Operation from './history/Operation';
import type SolidACLAuthorization from './SolidACLAuthorization';
import type SolidDocument from './SolidDocument';
import type SolidContainer from './SolidContainer';
import type Tombstone from './history/Tombstone';
import type { SolidDocumentRelationInstance } from './relations/mixins/SolidDocumentRelation';
import type { SolidModelConstructor } from './inference';
import type { SolidRelation } from './relations/inference';

export const SolidModelBase = mixed(Model, [
    DeletesModels,
    ManagesPermissions,
    MigratesSchemas,
    SerializesToJsonLD,
    TracksHistory,
]);

export interface SolidModelSerializationOptions {
    ids?: boolean;
    timestamps?: boolean;
    history?: boolean;
}

export class SolidModel extends SolidModelBase {

    public static primaryKey: string = 'url';
    public static fields: SolidFieldsDefinition;
    public static classFields = ['_history', '_publicPermissions', '_tombstone'];
    public static rdfContext?: string;
    public static rdfContexts: RDFContexts = {};
    public static rdfsClass?: string;
    public static rdfsClasses: string[] = [];
    public static rdfsClassesAliases: string[][] = [];
    public static reservedRelations: string[] = ['metadata', 'operations', 'tombstone', 'authorizations'];
    public static defaultResourceHash: string | null = 'it';
    public static slugField?: string;
    public static mintsUrls: boolean = true;
    public static history: boolean = false;
    public static tombstone: boolean = true;
    declare public static __isSchema?: boolean;

    protected static rdfPropertyFields?: Record<string, string>;
    protected static historyDisabled: WeakMap<SolidModel, void> = new WeakMap();

    public static getFieldDefinition(field: string, value?: unknown): SolidBootedFieldDefinition {
        if (field.endsWith('.*')) {
            const parentDefinition = this.getFieldDefinition(
                field.slice(0, -2),
                Array.isArray(value) && value.length > 0 ? value[0] : undefined,
            );

            if (!isSolidArrayFieldDefinition(parentDefinition)) {
                throw new SoukaiError('Can\'t get item field definition for non-array field');
            }

            return {
                type: parentDefinition.items.type,
                rdfProperty: parentDefinition.rdfProperty,
                rdfPropertyAliases: parentDefinition.rdfPropertyAliases,
                required: false,
            };
        }

        return (
            (this.fields as SolidBootedFieldsDefinition)[field] ??
            inferFieldDefinition(value, this.getDefaultRdfContext() + field, [], false)
        );
    }

    public static getFieldRdfProperty(field: string): string | null {
        const fieldDefinition = (this.fields as SolidBootedFieldsDefinition)[field];

        if (fieldDefinition && !fieldDefinition.rdfProperty) {
            return null;
        }

        return fieldDefinition?.rdfProperty ?? this.getDefaultRdfContext() + field;
    }

    public static getRdfPropertyField(rdfProperty: string): string | null {
        const fields = (this.rdfPropertyFields ??= invert(
            map(Object.keys(this.fields), (field) => this.getFieldRdfProperty(field) as string),
        ));

        return fields[rdfProperty] ?? null;
    }

    public static async updateSchema(schema: SolidSchemaDefinition | SolidModelConstructor): Promise<void>;
    public static async updateSchema(schema: SchemaDefinition | ModelConstructor): Promise<void>;
    public static async updateSchema(schema: SolidSchemaDefinition | SolidModelConstructor): Promise<void> {
        await super.updateSchema(schema);

        delete this.rdfPropertyFields;
    }

    public static requireFetch(): Fetch {
        if (!this.usingSolidEngine()) {
            throw new SoukaiError(`Could not get fetch from ${this.modelName} model`);
        }

        return (this.requireFinalEngine() as SolidEngine).getFetch();
    }

    public static requireFieldRdfProperty(field: string): string {
        return this.getFieldRdfProperty(field) ?? fail(`Couldn't get required property for rdf field '${field}'`);
    }

    public static usingSolidEngine(): boolean {
        return !!(this.requireFinalEngine() as { __isSolidEngine?: true }).__isSolidEngine;
    }

    public static from<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        parentUrl: string,
    ): SolidModelConstructor<T> {
        this.collection = parentUrl;

        return this;
    }

    public static at<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        parentUrl: string,
    ): SolidModelConstructor<T> {
        return this.from(parentUrl);
    }

    public static boot(name?: string): void {
        this.modelName = this.bootModelName(name);
        this.rdfContexts = this.bootRdfContexts(
            Object.getOwnPropertyDescriptor(this, 'rdfContext')?.value ?? null,
            Object.getOwnPropertyDescriptor(this, 'rdfContexts')?.value ?? {},
            this.rdfsClass,
        );
        this.rdfsClasses = this.bootRdfsClasses(
            Object.getOwnPropertyDescriptor(this, 'rdfsClass')?.value ?? null,
            Object.getOwnPropertyDescriptor(this, 'rdfsClasses')?.value ?? null,
            this.rdfContexts,
        );
        this.rdfsClassesAliases = this.bootRdfsClassesAliases(this.rdfsClassesAliases, this.rdfContexts);

        super.boot(name);
    }

    public static aliasRdfPrefixes(aliases: Record<string, string>): void {
        this.ensureBooted();

        for (const [original, alias] of Object.entries(aliases)) {
            const rdfsClassesAliases = this.rdfsClasses.reduce((rdfsClassAliases, rdfsClass) => {
                if (rdfsClass.startsWith(original)) {
                    rdfsClassAliases.push(rdfsClass.replace(original, alias));
                }

                return rdfsClassAliases;
            }, [] as string[]);

            if (rdfsClassesAliases.length > 0) {
                this.rdfsClassesAliases.push(rdfsClassesAliases);
            }

            for (const field of Object.values(this.fields as SolidBootedFieldsDefinition)) {
                if (!field.rdfProperty?.startsWith(original)) {
                    continue;
                }

                field.rdfPropertyAliases.push(field.rdfProperty.replace(original, alias));
            }
        }
    }

    public static resetRdfAliases(): void {
        this.rdfsClassesAliases = [];

        for (const field of Object.values(this.fields as SolidBootedFieldsDefinition)) {
            if (!field.rdfPropertyAliases) {
                continue;
            }

            field.rdfPropertyAliases = [];
        }
    }

    public static replaceRdfPrefixes(replacements: Record<string, string>): void {
        this.ensureBooted();

        for (const [original, replacement] of Object.entries(replacements)) {
            this.rdfsClasses = this.rdfsClasses.map((rdfsClass) => rdfsClass.replace(original, replacement));

            for (const field of Object.values(this.fields as SolidBootedFieldsDefinition)) {
                if (!field.rdfProperty?.startsWith(original)) {
                    continue;
                }

                field.rdfProperty = field.rdfProperty.replace(original, replacement);
            }
        }
    }

    /* eslint-disable max-len */
    public static createFromEngineDocument<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        id: Key,
        document: EngineDocument,
        resourceId?: string
    ): Promise<T>;

    public static createFromEngineDocument<T extends Model>(
        this: ModelConstructor<T>,
        id: Key,
        document: EngineDocument
    ): Promise<T>;

    public static createFromEngineDocument<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        id: Key,
        document: EngineDocument,
        resourceId?: string,
    ): Promise<T> {
        return this.instance().createFromEngineDocument(id, document, resourceId);
    }
    /* eslint-enable max-len */

    public static async find<T extends Model>(this: ModelConstructor<T>, id: Key): Promise<T | null>;
    public static async find<T extends SolidModel>(this: SolidModelConstructor<T>, id: Key): Promise<T | null>;
    public static async find<T extends SolidModel>(this: SolidModelConstructor<T>, id: Key): Promise<T | null> {
        const resourceUrl = this.instance().serializeKey(id);
        const documentUrl = urlRoute(resourceUrl);
        const containerUrl = urlParentDirectory(documentUrl) ?? urlRoot(documentUrl);

        this.ensureBooted();

        try {
            const { documentPermissions, stopTracking } = this.instance().trackPublicPermissions();
            const document = await this.requireEngine().readOne(containerUrl, documentUrl);
            const model = await this.instance().createFromEngineDocument(documentUrl, document, resourceUrl);

            stopTracking();

            model._publicPermissions = documentPermissions[documentUrl];

            return model;
        } catch (error) {
            if (
                applyStrictChecks() &&
                !isInstanceOf(error, DocumentNotFound) &&
                !isInstanceOf(error, ResourceNotFound) &&
                !isInstanceOf(error, IncompleteDocument)
            ) {
                throw error;
            }

            return null;
        }
    }

    /* eslint-disable max-len */
    public static async all<T extends Model>(this: ModelConstructor<T>, filters?: EngineFilters): Promise<T[]>;
    public static async all<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        filters?: EngineFilters
    ): Promise<T[]>;

    public static async all<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        filters: EngineFilters = {},
    ): Promise<T[]> {
        filters = this.prepareEngineFilters(filters);

        const { documentPermissions, stopTracking } = this.instance().trackPublicPermissions();

        const models = await this.withCollection(() => super.all(filters) as unknown as T[]);

        stopTracking();

        models.forEach((model) => (model._publicPermissions = documentPermissions[model.requireDocumentUrl()]));

        return models;
    }
    /* eslint-enable max-len */

    public static prepareEngineFilters(filters: EngineFilters = {}): EngineFilters {
        // This is necessary because a SolidEngine behaves differently than other engines.
        // Even if a document is stored using compacted IRIs, a SolidEngine will need them expanded
        // because it's ultimately stored in turtle, not json-ld.
        const compactIRIs = !this.usingSolidEngine();

        return this.instance().convertEngineFiltersToJsonLD(filters, compactIRIs);
    }

    public static rdfTerm(property: string, rdfContexts?: RDFContexts): string {
        rdfContexts ??= this.rdfContexts;

        return expandIRI(
            property,
            objectWithoutEmpty({
                extraContext: rdfContexts,
                defaultPrefix: Object.values(rdfContexts).shift(),
            }),
        );
    }

    public static async newFromJsonLD<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        sourceJsonLD: JsonLD,
        baseUrl?: string,
        sourceResourceId?: string,
    ): Promise<T> {
        const jsonld = mintJsonLDIdentifiers(sourceJsonLD);
        const rdfDocument = await RDFDocument.fromJsonLD(jsonld, baseUrl ?? this.collection);
        const flatJsonLD = await rdfDocument.toJsonLD();
        const resourceId =
            sourceResourceId ??
            this.findMatchingResourceIds(rdfDocument.statements, baseUrl)[0] ??
            fail<string>(SoukaiError, 'Couldn\'t find matching resource in JSON-LD');
        const resource = rdfDocument.resource(resourceId);
        const documentUrl = baseUrl || urlRoute(resourceId);
        const attributes = await this.instance().parseEngineDocumentAttributes(
            documentUrl,
            flatJsonLD as EngineDocument,
            resourceId,
        );

        if (this.hasAutomaticTimestamp(TimestampField.CreatedAt))
            attributes['createdAt'] = resource?.getPropertyValue(IRI('purl:created'));

        if (this.hasAutomaticTimestamp(TimestampField.UpdatedAt))
            attributes['updatedAt'] = resource?.getPropertyValue(IRI('purl:modified'));

        return tap(this.newInstance(objectWithoutEmpty(attributes)), async (model) => {
            await model.loadDocumentModels(documentUrl, flatJsonLD as EngineDocument);

            model.reset();
            model._sourceSubject = sourceJsonLD['@id'] ? parseResourceSubject(sourceJsonLD['@id']) : {};

            // TODO this should be recursive to take care of 2nd degree relations.
            for (const relationName of this.relations) {
                const relation = model.requireRelation(relationName);
                const models = relation.getLoadedModels();

                if (!relation.enabled) {
                    continue;
                }

                when(relation, isSolidDocumentRelation).reset(models);

                models.forEach((_model) => _model.reset());
            }
        });
    }

    public static async createFromJsonLD<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        jsonld: JsonLD,
        baseUrl?: string,
        resourceId?: string,
    ): Promise<T> {
        return tap(await this.newFromJsonLD(jsonld, baseUrl, resourceId), (model) => model.save(baseUrl));
    }

    public static async createInDocument<T extends SolidModel>(
        this: SolidModelConstructor<T>,
        attributes: Attributes,
        documentUrl: string,
        resourceHash?: string,
    ): Promise<T> {
        return tap(new this(attributes) as T, (instance) => instance.saveInDocument(documentUrl, resourceHash));
    }

    public static async synchronize<T extends SolidModel>(this: SolidModelConstructor<T>, a: T, b: T): Promise<void> {
        if (this !== a.static()) {
            return a.static().synchronize(a, b);
        }

        await synchronizeModels(a, b);
    }

    public static findMatchingResourceIds(quads: Quad[], baseUrl?: string): string[] {
        const resourcesTypes = quads.reduce(
            (types, quad) => {
                if (quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
                    types[quad.subject.value] = types[quad.subject.value] ?? [];

                    types[quad.subject.value]?.push(quad.object.value);
                }

                return types;
            },
            {} as Record<string, string[]>,
        );

        return Object.entries(resourcesTypes)
            .filter(([_, types]) => types.some((type) => this.rdfsClasses.includes(type)))
            .map(([resourceId]) => (baseUrl ? urlResolve(baseUrl, resourceId) : resourceId));
    }

    protected static bootRdfContexts(
        rdfContext: string | null,
        rdfContexts: RDFContexts,
        rdfsClass: string | undefined,
        options: { modelClass?: typeof SolidModel; skipParentSchema?: boolean } = {},
    ): RDFContexts {
        const modelClass = options.modelClass ?? this;
        const builtInRdfContexts = {
            crdt: 'https://vocab.noeldemartin.com/crdt/',
            foaf: 'http://xmlns.com/foaf/0.1/',
            ldp: 'http://www.w3.org/ns/ldp#',
            pim: 'http://www.w3.org/ns/pim/space#',
            posix: 'http://www.w3.org/ns/posix/stat#',
            purl: 'http://purl.org/dc/terms/',
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            schema: 'https://schema.org/',
            solid: 'http://www.w3.org/ns/solid/terms#',
            xsd: 'http://www.w3.org/2001/XMLSchema#',
        };
        const rdfContextFromClass = () =>
            Object.entries({ ...rdfContexts, ...builtInRdfContexts }).find(
                ([shorthand, url]) => rdfsClass?.startsWith(`${shorthand}:`) || rdfsClass?.startsWith(toString(url)),
            )?.[1];

        rdfContexts.default ??= rdfContext ?? rdfContextFromClass() ?? Object.values(rdfContexts).find((url) => !!url);

        let parentModelClass = Object.getPrototypeOf(modelClass);

        if (options.skipParentSchema && parentModelClass.__isSchema) {
            parentModelClass = Object.getPrototypeOf(parentModelClass);
        }

        if (!parentModelClass) {
            return {
                ...rdfContexts,
                ...builtInRdfContexts,
                default: rdfContexts.default ?? 'http://www.w3.org/ns/solid/terms#',
            };
        }

        return this.bootRdfContexts(
            Object.getOwnPropertyDescriptor(parentModelClass, 'rdfContext')?.value ?? null,
            {
                ...rdfContexts,
                ...(Object.getOwnPropertyDescriptor(parentModelClass, 'rdfContexts')?.value ?? {}),
            },
            parentModelClass.rdfsClass,
            { modelClass: parentModelClass },
        );
    }

    protected static bootRdfsClasses(
        rdfsClass: string | null,
        rdfsClasses: string[] | null,
        rdfContexts: RDFContexts,
        initialClass?: typeof SolidModel,
    ): string[] {
        const modelClass = initialClass ?? this;

        if (rdfsClasses && rdfsClasses.length > 0) {
            return arrayUnique(rdfsClasses?.map((name) => this.rdfTerm(name, rdfContexts)) ?? []);
        }

        if (rdfsClass) {
            return [this.rdfTerm(rdfsClass, rdfContexts)];
        }

        const parentModelClass = Object.getPrototypeOf(modelClass);

        if (!parentModelClass) {
            return [this.rdfTerm(this.getDefaultRdfContext(rdfContexts) + this.modelName, rdfContexts)];
        }

        return this.bootRdfsClasses(
            Object.getOwnPropertyDescriptor(parentModelClass, 'rdfsClass')?.value ?? null,
            Object.getOwnPropertyDescriptor(parentModelClass, 'rdfsClasses')?.value ?? null,
            {
                ...rdfContexts,
                ...(Object.getOwnPropertyDescriptor(parentModelClass, 'rdfContexts')?.value ?? {}),
            },
            parentModelClass,
        );
    }

    protected static bootRdfsClassesAliases(rdfsClassesAliases: string[][], rdfContexts: RDFContexts): string[][] {
        return rdfsClassesAliases.map((rdfsClasses) =>
            arrayUnique(
                rdfsClasses.map((name) => IRI(name, this.rdfContexts, this.getDefaultRdfContext(rdfContexts))) ?? [],
            ));
    }

    protected static bootCollection(): string {
        const collection = super.bootCollection();

        if (!collection.match(/^\w+:\/\/.*\/$/)) {
            throw new InvalidModelDefinition(
                this.modelName,
                'SolidModel collections must be valid container urls (ending with a trailing slash), ' +
                    `'${collection}' isn't.`,
            );
        }

        return collection;
    }

    protected static bootFields(
        fields: SolidFieldsDefinition | undefined,
        primaryKey: string,
        timestamps: TimestampFieldValue[],
        fieldDefinitions: SolidBootedFieldsDefinition,
    ): { fields: BootedFieldsDefinition; fieldAliases: Record<string, string> } {
        const rdfContexts = getSchemaUpdateContext(this) ?? this.rdfContexts;
        const defaultRdfContext = this.getDefaultRdfContext(rdfContexts);

        const { fieldAliases } = super.bootFields(fields, primaryKey, timestamps, fieldDefinitions);

        if (timestamps.includes(TimestampField.CreatedAt)) {
            delete fieldDefinitions[TimestampField.CreatedAt];
        }

        if (timestamps.includes(TimestampField.UpdatedAt)) {
            delete fieldDefinitions[TimestampField.UpdatedAt];
        }

        for (const [name, field] of Object.entries(fieldDefinitions)) {
            field.rdfProperty = IRI(field.rdfProperty ?? `${defaultRdfContext}${name}`, rdfContexts, defaultRdfContext);
            field.rdfPropertyAliases =
                field.rdfPropertyAliases?.map((property) => IRI(property, rdfContexts, defaultRdfContext)) ?? [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (fieldDefinitions as any)[primaryKey]?.rdfProperty;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (fieldDefinitions as any)[primaryKey]?.rdfPropertyAliases;

        return {
            fields: fieldDefinitions,
            fieldAliases,
        };
    }

    protected static getDefaultRdfContext(rdfContexts?: RDFContexts): string {
        rdfContexts ??= this.rdfContexts;

        return rdfContexts.default ?? '';
    }

    protected static async performSchemaUpdate(schema: SolidSchemaDefinition | SolidModelConstructor): Promise<void> {
        try {
            schema.primaryKey ??= 'url';

            const rdfContexts = this.bootRdfContexts(
                schema.rdfContext ?? null,
                { ...schema.rdfContexts },
                schema.rdfsClass,
                { skipParentSchema: true },
            );
            const rdfsClasses = this.bootRdfsClasses(schema.rdfsClass ?? null, schema.rdfsClasses ?? null, rdfContexts);
            const rdfsClassesAliases = this.bootRdfsClassesAliases(schema.rdfsClassesAliases ?? [], rdfContexts);

            startSchemaUpdate(this, rdfContexts);

            await super.performSchemaUpdate(schema);

            this.rdfContexts = rdfContexts;
            this.rdfsClasses = rdfsClasses;
            this.rdfsClassesAliases = rdfsClassesAliases;
            this.rdfsClass = schema.rdfsClass;
            this.rdfContext = schema.rdfContext;
            this.defaultResourceHash = schema.defaultResourceHash ?? 'it';
            this.slugField = schema.slugField;
            this.history = schema.history ?? false;
            this.tombstone = schema.tombstone ?? true;
        } finally {
            stopSchemaUpdate(this);
        }
    }

    // TODO this should be optional
    declare public url: string;

    declare public deletedAt?: Date;
    declare public authorizations?: SolidACLAuthorization[];
    declare public metadata: Metadata;
    declare public operations: Operation[];
    declare public tombstone?: Tombstone;
    declare public relatedAuthorizations: SolidACLAuthorizationsRelation<this>;
    declare public relatedMetadata: SolidHasOneRelation<this, Metadata, SolidModelConstructor<Metadata>>;
    declare public relatedOperations: OperationsRelation<this>;
    declare public relatedTombstone: TombstoneRelation<this>;

    declare protected _documentExists: boolean;
    declare protected _sourceDocumentUrl: string | null;
    declare protected _trackedDirtyAttributes: Attributes;
    declare protected _removedResourceUrls: string[];
    declare protected _usesRdfAliases: boolean;
    declare protected _relations: Record<string, SolidRelation>;

    private _sourceSubject: SubjectParts = {};
    private _lock = new Semaphore();

    protected initialize(attributes: Attributes, exists: boolean): void {
        this._documentExists = exists;
        this._sourceDocumentUrl = this._sourceDocumentUrl ?? null;
        this._trackedDirtyAttributes = {};
        this._removedResourceUrls = [];
        this._usesRdfAliases = false;

        super.initialize(attributes, exists);
    }

    protected initializeRelations(): void {
        super.initializeRelations();

        this.initializeRelationsEnabling();
        this.initializeMetadataRelation();
    }

    protected initializeRelationsEnabling(): void {
        if (!this.static().hasAutomaticTimestamps()) {
            this._proxy.relatedMetadata.disable();
        }

        if (!this._proxy.tracksHistory()) {
            this._proxy.relatedOperations.disable();
            this._proxy.relatedTombstone.disable();
        }

        this._proxy.relatedAuthorizations.disable();
    }

    protected initializeMetadataRelation(): void {
        if (!this._proxy.relatedMetadata.enabled) {
            return;
        }

        const metadataModelClass = this._proxy.relatedMetadata.relatedClass;
        const metadataModel = metadataModelClass.newInstance(
            objectWithoutEmpty({
                resourceUrl: this._attributes[this.static('primaryKey')],
                createdAt: this._attributes.createdAt,
                updatedAt: this._attributes.updatedAt,
            }),
            false,
        );

        metadataModel.resourceUrl && metadataModel.mintUrl(this.getDocumentUrl() || undefined, this._documentExists);
        this._proxy.relatedMetadata.attach(metadataModel);

        delete this._attributes.createdAt;
        delete this._attributes.updatedAt;
        delete this._originalAttributes.createdAt;
        delete this._originalAttributes.updatedAt;
    }

    public static(property: 'fields'): SolidBootedFieldsDefinition;
    public static(property: 'timestamps'): TimestampFieldValue[];
    public static<T extends typeof SolidModel>(): T;
    public static<T extends typeof SolidModel, K extends keyof T>(property: K): T[K];
    public static<T extends typeof SolidModel, K extends keyof T>(property?: K): T | T[K] {
        return super.static<T, K>(property as K);
    }

    public update(attributes?: Attributes): Promise<this> {
        return this._lock.run(() => super.update(attributes));
    }

    public save(collection?: string): Promise<this> {
        return this.static().withCollection(collection || this.guessCollection(), () => super.save());
    }

    public async saveInDocument(documentUrl: string, resourceHash?: string): Promise<this> {
        this.exists()
            ? assert(
                this.getDocumentUrl() === documentUrl,
                SoukaiError,
                'Model already exists and is not stored in the given document',
            )
            : this.mintUrl(documentUrl, true, resourceHash);

        await this.save();

        return this;
    }

    public delete(): Promise<this> {
        return this.static().withCollection(this.guessCollection(), () => super.delete());
    }

    public async softDelete(): Promise<this> {
        if (!this.static().hasAutomaticTimestamps()) {
            throw new SoukaiError('Cannot soft delete a model without automatic timestamps');
        }

        if (this.isSoftDeleted()) {
            return this;
        }

        const now = new Date();

        this.metadata.setAttribute(TimestampField.UpdatedAt, now);
        this.metadata.setAttribute('deletedAt', now);

        await this.save();

        return this;
    }

    public async registerInTypeIndex(typeIndexUrl: string): Promise<void> {
        const documentModelClass = requireBootedModel<typeof SolidDocument>('SolidDocument');
        const document = new documentModelClass({ url: this.getDocumentUrl() });

        await document.register(typeIndexUrl, this.static());
    }

    public mintUrl(documentUrl?: string, documentExists?: boolean, resourceHash?: string): void {
        this.setAttribute(this.static('primaryKey'), this.newUrl(documentUrl, resourceHash));

        if (documentUrl) {
            this._documentExists = documentExists ?? true;
        }
    }

    public toJsonLD(options: SolidModelSerializationOptions = {}): Record<string, unknown> {
        options = {
            ids: true,
            timestamps: true,
            history: true,
            ...options,
        };
        const model = this.clone();

        if (!options.ids) model.getRelatedModels().forEach((relatedModel) => relatedModel.setAttribute('url', null));

        if (!options.timestamps)
            model.getRelatedModels().forEach((relatedModel) => {
                relatedModel.relatedMetadata.related = null;
                delete relatedModel.relatedMetadata.__modelInSameDocument;
                delete relatedModel.relatedMetadata.__modelInOtherDocumentId;
                delete relatedModel.relatedMetadata.__newModel;
            });

        if (!options.history)
            model.getRelatedModels().forEach((relatedModel) => {
                relatedModel.relatedOperations.related = [];
                relatedModel.relatedOperations.__newModels = [];
                delete relatedModel.relatedOperations.__modelsInSameDocument;
                delete relatedModel.relatedOperations.__modelsInOtherDocumentIds;
            });

        return model.serializeToJsonLD();
    }

    public async toTurtle(options: SolidModelSerializationOptions = {}): Promise<string> {
        const quads = await jsonldToQuads(this.toJsonLD(options));

        return quadsToTurtle(quads);
    }

    public getIdAttribute(): string {
        return this.getAttribute('url');
    }

    public setExists(exists: boolean): void {
        this._documentExists = exists && this._documentExists;

        super.setExists(exists);
    }

    public documentExists(): boolean {
        return this._documentExists;
    }

    public setDocumentExists(documentExists: boolean): void {
        this._documentExists = documentExists;

        Object.values(this._relations)
            .filter(isSolidDocumentRelation)
            .filter((relation) => relation.enabled && relation.useSameDocument && !usingExperimentalActivityPods())
            .map((relation) => relation.getLoadedModels())
            .flat()
            .forEach((relatedModel) => relatedModel.setDocumentExists(documentExists));
    }

    public isDirty(field?: string, ignoreRelations?: boolean): boolean {
        if (field)
            return this.static('timestamps').includes(field as TimestampFieldValue)
                ? this.metadata?.isDirty(field) || super.isDirty(field)
                : super.isDirty(field);

        if (super.isDirty()) return true;

        if (ignoreRelations) {
            return this.metadata?.isDirty('deletedAt');
        }

        const dirtyDocumentModels = this.getDocumentModels().filter((model) => model.isDirty(undefined, true));
        const removedDocumentModels = this.getRemovedDocumentModels();

        return dirtyDocumentModels.length + removedDocumentModels.length > 0;
    }

    public isSoftDeleted(): boolean {
        return !!this.metadata?.deletedAt;
    }

    public cleanDirty(ignoreRelations?: boolean): void {
        super.cleanDirty();

        this._documentExists = true;
        this._trackedDirtyAttributes = {};
        this._removedResourceUrls = [];

        Object.values(this._relations)
            .filter(isSolidMultiModelDocumentRelation)
            .filter((relation) => relation.enabled && relation.useSameDocument && !usingExperimentalActivityPods())
            .forEach((relation) => {
                relation.__modelsInSameDocument = relation.__modelsInSameDocument || [];
                relation.__modelsInSameDocument.push(...relation.__newModels);

                relation.__newModels = [];
            });

        Object.values(this._relations)
            .filter(isSolidSingleModelDocumentRelation)
            .filter(
                (relation) =>
                    relation.useSameDocument &&
                    relation.enabled &&
                    !!relation.__newModel &&
                    !usingExperimentalActivityPods(),
            )
            .forEach((relation) => {
                relation.__modelInSameDocument = relation.__newModel;

                delete relation.__newModel;
            });

        if (!ignoreRelations) this.getDocumentModels().forEach((model) => model.cleanDirty(true));
    }

    public fixMalformedAttributes(): void {
        super.fixMalformedAttributes();

        if (!this.relatedMetadata.enabled) {
            return;
        }

        if (this.static().hasAutomaticTimestamp(TimestampField.CreatedAt)) {
            this.metadata.createdAt = this.getAttribute('createdAt') ?? new Date();
        }

        if (this.static().hasAutomaticTimestamp(TimestampField.UpdatedAt)) {
            this.metadata.updatedAt = this.getAttribute('updatedAt') ?? this.getAttribute('createdAt') ?? new Date();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public ignoreRdfPropertyHistory(rdfProperty: string, withSolidEngine?: boolean): boolean {
        return false;
    }

    public getDocumentUrl(): string | null {
        return this.url ? urlRoute(this.url) : null;
    }

    public requireDocumentUrl(): string {
        return this.getDocumentUrl() ?? fail(SoukaiError, 'Failed getting required document url');
    }

    public usesRdfAliases(): boolean {
        return this._usesRdfAliases;
    }

    public getSourceDocumentUrl(): string | null {
        return this._sourceDocumentUrl;
    }

    public setSourceDocumentUrl(sourceDocumentUrl: string | null): void {
        this._sourceDocumentUrl = sourceDocumentUrl;
    }

    public requireContainerUrl(): string {
        return this.getContainerUrl() ?? fail(SoukaiError, 'Failed getting required container url');
    }

    public getContainerUrl(): string | null {
        const documentUrl = this.getDocumentUrl();

        return documentUrl ? urlParentDirectory(documentUrl) : null;
    }

    public getSourceContainerUrl(): string | null {
        const documentUrl = this.getSourceDocumentUrl();

        return documentUrl ? urlParentDirectory(documentUrl) : null;
    }

    public setAttribute(field: string, value: unknown): void {
        const oldPrimaryKey = this.getPrimaryKey();

        super.setAttribute(field, value);

        const primaryKey = this.getPrimaryKey();

        if (oldPrimaryKey !== primaryKey) this.onPrimaryKeyUpdated(primaryKey, oldPrimaryKey);
    }

    public unsetAttribute(field: string): void {
        if (this.static('fields')?.[field]?.type === FieldType.Array) return this.setAttributeValue(field, []);

        return super.unsetAttribute(field);
    }

    public setCreatedAtAttribute(value: unknown): void {
        (this.metadata ?? this).setAttributeValue('createdAt', value);
    }

    public setUpdatedAtAttribute(value: unknown): void {
        (this.metadata ?? this).setAttributeValue('updatedAt', value);
    }

    public getCreatedAtAttribute(): Date {
        return this.metadata?.getAttributeValue('createdAt') ?? super.getAttributeValue('createdAt');
    }

    public getUpdatedAtAttribute(): Date {
        return this.metadata?.getAttributeValue('updatedAt') ?? super.getAttributeValue('updatedAt');
    }

    public getDeletedAtAttribute(): Date | undefined {
        return this.metadata?.getAttributeValue('deletedAt') ?? super.getAttributeValue('deletedAt');
    }

    public getDocumentModels(_documentModels?: Set<SolidModel>): SolidModel[] {
        const documentModels = _documentModels ?? new Set();

        if (documentModels.has(this)) {
            return [...documentModels];
        }

        const documentUrl = this.getDocumentUrl();
        const addModels = (models: SolidModel[]) => models.forEach((model) => documentModels.add(model));

        documentModels.add(this);

        for (const relation of Object.values(this._relations)) {
            const isDocumentContainsManyRelation = relation instanceof DocumentContainsManyRelation;

            if (
                !relation.enabled ||
                !relation.loaded ||
                (!isDocumentContainsManyRelation && !isSolidDocumentRelation(relation)) ||
                (isSolidDocumentRelation(relation) && (!relation.useSameDocument || usingExperimentalActivityPods()))
            ) {
                continue;
            }

            if (isSolidSingleModelDocumentRelation(relation) && relation.__newModel) {
                addModels(relation.__newModel.getDocumentModels(documentModels));
            }

            if (isSolidMultiModelDocumentRelation(relation)) {
                addModels(relation.__newModels.map((model) => model.getDocumentModels(documentModels)).flat());
            }

            addModels(
                relation
                    .getLoadedModels()
                    .filter((model) => isDocumentContainsManyRelation || model.getDocumentUrl() === documentUrl)
                    .map((model) => model.getDocumentModels(documentModels))
                    .flat(),
            );
        }

        return [...documentModels];
    }

    public getRemovedDocumentModels(): SolidModel[] {
        const removedModels = new Set<SolidModel>();

        for (const relation of Object.values(this._relations)) {
            if (
                !relation.enabled ||
                !relation.loaded ||
                !isSolidDocumentRelation(relation) ||
                !isSolidMultiModelDocumentRelation(relation)
            ) {
                continue;
            }

            relation.__removedDocumentModels.forEach((model) => removedModels.add(model));
        }

        return [...removedModels];
    }

    public getDirtyDocumentModels(): SolidModel[] {
        return this.getDocumentModels().filter((model) => model.isDirty());
    }

    public requireRelation<T extends SolidRelation = SolidRelation>(relation: string): T;
    public requireRelation<T extends Relation = Relation>(relation: string): T;
    public requireRelation<T extends SolidRelation = SolidRelation>(relation: string): T {
        return super.requireRelation(relation);
    }

    public getRelationModel<T extends SolidModel>(relation: string): T | null;
    public getRelationModel<T extends Model>(relation: string): T | null;
    public getRelationModel<T extends SolidModel>(relation: string): T | null {
        return super.getRelationModel<T>(relation);
    }

    public getRelationModels<T extends SolidModel>(relation: string): T[] | null;
    public getRelationModels<T extends Model>(relation: string): T[] | null;
    public getRelationModels<T extends SolidModel>(relation: string): T[] | null {
        return super.getRelationModels<T>(relation);
    }

    public setRelationModel(relation: string, model: SolidModel | null): void {
        return super.setRelationModel(relation, model);
    }

    public setRelationModels(relation: string, models: SolidModel[] | null): void {
        return super.setRelationModels(relation, models);
    }

    public getRelatedModels(_relatedModels?: Set<SolidModel>): SolidModel[] {
        const relatedModels = _relatedModels ?? new Set();

        if (relatedModels.has(this)) return [...relatedModels];

        relatedModels.add(this);

        for (const relation of Object.values(this._relations)) {
            if (!relation.enabled) {
                continue;
            }

            const relationModels = [
                ...(isSolidSingleModelDocumentRelation(relation) && relation.__newModel
                    ? relation.__newModel.getRelatedModels(relatedModels)
                    : []),
                ...(isSolidMultiModelDocumentRelation(relation)
                    ? relation.__newModels.map((model) => model.getRelatedModels(relatedModels)).flat()
                    : []),
                ...relation
                    .getLoadedModels()
                    .map((model) => model.getRelatedModels(relatedModels))
                    .flat(),
            ];

            relationModels.forEach((model) => relatedModels.add(model));
        }

        return [...relatedModels];
    }

    public usingSolidEngine(): boolean {
        return !!(this.requireFinalEngine() as { __isSolidEngine?: true }).__isSolidEngine;
    }

    public metadataRelationship(): Relation {
        const metadataModelClass = requireBootedModel<typeof Metadata>('Metadata');

        return this.hasOne(metadataModelClass, 'resourceUrl')
            .usingSameDocument(!usingExperimentalActivityPods())
            .onDelete('cascade');
    }

    public operationsRelationship(): Relation {
        return new OperationsRelation(this).usingSameDocument(!usingExperimentalActivityPods()).onDelete('cascade');
    }

    public tombstoneRelationship(): Relation {
        return new TombstoneRelation(this);
    }

    public authorizationsRelationship(): Relation {
        return new SolidACLAuthorizationsRelation(this);
    }

    public onMoved(newResourceUrl: string, newDocumentUrl?: string): void {
        newDocumentUrl && this.setSourceDocumentUrl(newDocumentUrl);
        this.setAttribute('url', newResourceUrl);
        this.cleanDirty();

        // TODO update related models as well using same document
    }

    protected getDefaultCollection(): string {
        const collection = super.getDefaultCollection();

        return `solid://${collection}/`;
    }

    protected async createFromEngineDocument(id: Key, document: EngineDocument, resourceId?: string): Promise<this> {
        const createModel = async () => {
            const attributes = await this.parseEngineDocumentAttributes(id, document, resourceId);

            attributes[this.static('primaryKey')] = new ModelKey(resourceId || id);

            return this.newInstance(attributes, true);
        };

        const documentUrl = toString(id);
        const resource = await RDFDocument.resourceFromJsonLDGraph(document as JsonLDGraph, resourceId || documentUrl);
        const model = await createModel();

        await model.loadDocumentModels(documentUrl, document);

        if (model.hasIncompleteAttributes()) {
            throw new IncompleteDocument(documentUrl);
        }

        return tap(model, (m) => {
            m._sourceDocumentUrl = urlClean(documentUrl, { fragment: false });
            m._usesRdfAliases = this.static('rdfsClassesAliases').some(
                (types) => !types.some((type) => !resource.isType(type)),
            );
        });
    }

    protected async createManyFromEngineDocuments(documents: Record<string, EngineDocument>): Promise<this[]> {
        const rdfsClasses = arrayUnique([this.static('rdfsClasses'), ...this.static('rdfsClassesAliases')].flat());
        const models = await Promise.all(
            Object.entries(documents).map(async ([documentUrl, engineDocument]) => {
                const rdfDocument = await RDFDocument.fromJsonLD(engineDocument);

                return Promise.all(
                    rdfDocument.resources
                        .filter(
                            (resource): resource is RDFResource & { url: string } =>
                                !!resource.url && rdfsClasses.some((type) => resource.isType(type)),
                        )
                        .map(async (resource) => {
                            try {
                                const model = await this.createFromEngineDocument(
                                    documentUrl,
                                    engineDocument,
                                    resource.url,
                                );

                                return model;
                            } catch (error) {
                                if (error instanceof IncompleteDocument) {
                                    return null;
                                }

                                throw error;
                            }
                        }),
                );
            }),
        );

        return arrayFilter(models.flat());
    }

    protected async loadDocumentModels(documentUrl: string, document: EngineDocument): Promise<void> {
        const engine = this.requireEngine();

        await Promise.all(
            Object.values(this._relations)
                .filter(
                    (relation: Relation): relation is SolidDocumentRelationInstance =>
                        relation.enabled &&
                        (isSolidDocumentRelation(relation) || relation instanceof DocumentContainsManyRelation),
                )
                .map(async (relation) => {
                    return relation.relatedClass.withEngine(engine, () =>
                        relation.__loadDocumentModels(documentUrl, document as JsonLDGraph));
                }),
        );
    }

    protected async beforeSave(ignoreRelations?: boolean): Promise<void> {
        const wasTouched = this.isDirty(TimestampField.UpdatedAt) || !!this.metadata?.isDirty(TimestampField.UpdatedAt);

        await super.beforeSave();

        if (!this.url && this.static('mintsUrls') && !usingExperimentalActivityPods()) {
            this.mintUrl();
        }

        if (ignoreRelations) return;

        await Promise.all(this.getDirtyDocumentModels().map(async (model) => model.exists() || model.beforeCreate()));
        await this.beforeDocumentSave();
        await Promise.all(this.getDirtyDocumentModels().map(async (model) => model.exists() && model.beforeUpdate()));

        this.reconcileModelTimestamps(wasTouched);
    }

    protected async beforeDocumentSave(): Promise<void> {
        let unprocessedModels: SolidModel[] = [];
        const processedModels = new Set<SolidModel>();
        const hasUnprocessedModels = () => {
            unprocessedModels = this.getDirtyDocumentModels().filter((model) => !processedModels.has(model));

            return unprocessedModels.length > 0;
        };

        while (hasUnprocessedModels()) {
            if (this.static('mintsUrls') && !usingExperimentalActivityPods()) {
                this.mintDocumentModelsKeys(unprocessedModels);
            }

            await Promise.all(
                unprocessedModels.map(async (model) => {
                    if (model !== this && model.isDirty()) await model.beforeSave(true);

                    processedModels.add(model);
                }),
            );
        }
    }

    protected async beforeCreate(): Promise<void> {
        for (const relation of Object.values(this._relations)) {
            if (!relation.enabled || !hasBeforeParentCreateHook(relation)) {
                continue;
            }

            relation.__beforeParentCreate();
        }

        if (
            this.metadata &&
            !this.metadata.resourceUrl &&
            this.static('defaultResourceHash') &&
            !usingExperimentalActivityPods()
        ) {
            this.metadata.resourceUrl = this.url ?? `#${this.static('defaultResourceHash')}`;
            this.metadata.mintUrl(this.getDocumentUrl() || undefined, this._documentExists);
        }
    }

    protected async beforeUpdate(): Promise<void> {
        if (!this.tracksHistory()) {
            return;
        }

        if (this.isDirty(undefined, true)) {
            await this.addDirtyHistoryOperations();
            await Promise.all(
                this.operations.map(async (operation) => {
                    if (operation.exists()) return;

                    await operation.beforeCreate();
                    await operation.beforeSave(true);

                    this.mintDocumentModelsKeys([operation]);
                }),
            );
        }
    }

    protected async performSave(): Promise<void> {
        const dirtyDocumentModelsExisted: [SolidModel, boolean][] = this.getDirtyDocumentModels().map((model) => [
            model,
            model.exists(),
        ]);

        try {
            await super.performSave();
        } catch (error) {
            if (!(error instanceof DocumentAlreadyExists)) throw error;

            this.url = this.newUniqueUrl(this.url);

            await super.performSave();
        }

        dirtyDocumentModelsExisted.forEach(([model, existed]) => {
            model._wasRecentlyCreated = model._wasRecentlyCreated || !existed;
        });
    }

    protected async performDelete(): Promise<void> {
        if (this.tracksHistory() && this.leavesTombstone()) {
            this.relatedTombstone.create();
        }

        await super.performDelete();
    }

    protected async afterSave(ignoreRelations?: boolean): Promise<void> {
        await super.afterSave();

        if (ignoreRelations) {
            return;
        }

        if (this.metadata && this.metadata.resourceUrl !== this.url) {
            this.metadata.resourceUrl = this.url;

            if (!usingExperimentalActivityPods()) {
                this.metadata.mintUrl(this.getDocumentUrl() || undefined, this._documentExists);
            }
        }

        await Promise.all(this.getDirtyDocumentModels().map((model) => model.afterSave(true)));
    }

    protected onPrimaryKeyUpdated(value: Key | null, oldValue: Key | null): void {
        const documentUrl = this.getDocumentUrl() || undefined;
        const documentExists = this.documentExists();
        const hasRelations = Object.values(this._relations).filter(
            (relation) => relation.enabled && isSolidHasRelation(relation),
        );

        for (const relation of hasRelations) {
            relation.getLoadedModels().forEach((model) => {
                const foreignValue = model.getAttribute(relation.foreignKeyName);

                model.setAttribute(
                    relation.foreignKeyName,
                    !Array.isArray(foreignValue)
                        ? value
                        : tap(foreignValue.slice(0), (newForeignValue) =>
                            arrayReplace(newForeignValue, oldValue, value)),
                );
            });
        }

        if (!usingExperimentalActivityPods()) {
            this.metadata?.mintUrl(documentUrl, documentExists);
            this.operations?.map((operation) => operation.mintUrl(documentUrl, documentExists));
        }
    }

    protected async syncDirty(): Promise<string> {
        const documentUrl = this.getDocumentUrl();

        const createDocument = () =>
            this.requireEngine().create(
                documentUrl ? requireUrlParentDirectory(documentUrl) : this.static('collection'),
                this.toEngineDocument(),
                documentUrl || undefined,
            );
        const addToDocument = () =>
            this.requireEngine().update(requireUrlParentDirectory(documentUrl as string), documentUrl as string, {
                '@graph': { $push: this.serializeToJsonLD() as EngineDocument },
            });
        const updateDocument = () =>
            this.requireEngine().update(
                requireUrlParentDirectory(documentUrl as string),
                documentUrl as string,
                this.getDirtyEngineDocumentUpdates(),
            );
        const updateDatabase = async () => {
            if (!this._documentExists) {
                const defaultResourceHash = this.static('defaultResourceHash');
                const _documentUrl = await createDocument();

                return (
                    this.getSerializedPrimaryKey() ??
                    (defaultResourceHash && !usingExperimentalActivityPods()
                        ? `${_documentUrl}#${defaultResourceHash}`
                        : _documentUrl)
                );
            }

            if (!this._exists) {
                await addToDocument();

                return this.getSerializedPrimaryKey();
            }

            await updateDocument();

            return this.getSerializedPrimaryKey();
        };

        return (await updateDatabase()) ?? fail(SoukaiError, 'Missing primary key');
    }

    protected async deleteModelsFromEngine(models: this[]): Promise<void> {
        await this.deleteModels(models);
    }

    /* eslint-disable max-len */
    protected hasOne<T extends typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): SolidHasOneRelation;

    protected hasOne<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): Relation;

    protected hasOne<T extends typeof Model | typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation | SolidHasOneRelation {
        return new SolidHasOneRelation(this, relatedClass as typeof SolidModel, foreignKeyField, localKeyField);
    }
    /* eslint-enable max-len */

    /* eslint-disable max-len */
    protected hasMany<T extends typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): SolidHasManyRelation;

    protected hasMany<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): Relation;

    protected hasMany<T extends typeof Model | typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation | SolidHasManyRelation {
        return new SolidHasManyRelation(this, relatedClass as typeof SolidModel, foreignKeyField, localKeyField);
    }
    /* eslint-enable max-len */

    /* eslint-disable max-len */
    protected belongsToOne<T extends typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): SolidBelongsToOneRelation;

    protected belongsToOne<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): Relation;

    protected belongsToOne<T extends typeof Model | typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation | SolidBelongsToOneRelation {
        return new SolidBelongsToOneRelation(this, relatedClass as typeof SolidModel, foreignKeyField, localKeyField);
    }
    /* eslint-enable max-len */

    /* eslint-disable max-len */
    protected belongsToMany<T extends typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): SolidBelongsToManyRelation;

    protected belongsToMany<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string
    ): Relation;

    protected belongsToMany<T extends typeof Model | typeof SolidModel>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation | SolidBelongsToManyRelation {
        return new SolidBelongsToManyRelation(this, relatedClass as typeof SolidModel, foreignKeyField, localKeyField);
    }
    /* eslint-enable max-len */

    protected isContainedBy<T extends typeof SolidContainer>(model: T): SolidIsContainedByRelation {
        return new SolidIsContainedByRelation(this, model);
    }

    protected documentContainsMany<T extends typeof SolidModel>(model: T): DocumentContainsManyRelation {
        return new DocumentContainsManyRelation(this, model);
    }

    protected toEngineDocument(): EngineDocument {
        return {
            '@graph': [
                ...this.getDirtyDocumentModels().map((model) =>
                    model.serializeToJsonLD({
                        includeRelations: false,
                        includeAnonymousHashes: true,
                    })),
            ],
        } as EngineDocument;
    }

    protected getDirtyEngineDocumentUpdates(ignoreRelations?: boolean): EngineUpdates {
        const graphUpdates: EngineAttributeUpdateOperation[] = [];
        const engine = this.requireEngine();
        const documentModels = this.getDirtyDocumentModels();
        const removedDocumentModels = this.getRemovedDocumentModels();

        if (!ignoreRelations) {
            for (const documentModel of documentModels) {
                if (documentModel === this) continue;

                if (!documentModel.exists()) {
                    graphUpdates.push({
                        $push: documentModel.serializeToJsonLD({ includeRelations: false }) as EngineAttributeValue,
                    });

                    continue;
                }

                const relatedDocumentUpdates = documentModel.withEngine(engine, (model) =>
                    model.getDirtyEngineDocumentUpdates(true)) as {
                    '@graph': EngineAttributeUpdateOperation | { $apply: EngineAttributeUpdateOperation[] };
                };

                const relatedGraphUpdates = relatedDocumentUpdates['@graph'];

                '$apply' in relatedGraphUpdates
                    ? graphUpdates.push(...relatedGraphUpdates.$apply)
                    : graphUpdates.push(relatedGraphUpdates);
            }

            for (const removedModel of removedDocumentModels) {
                removedModel.getDocumentModels().forEach((model) =>
                    graphUpdates.push({
                        $updateItems: {
                            $where: { '@id': model.url },
                            $unset: true,
                        },
                    }));
            }
        }

        if (super.isDirty() && this.url) {
            const modelUpdates = super.getDirtyEngineDocumentUpdates();

            // This is necessary because a SolidEngine behaves differently than other engines.
            // Even if a document is stored using compacted IRIs, a SolidEngine will need them expanded
            // because it's ultimately stored in turtle, not json-ld.
            const compactIRIs = !this.usingSolidEngine();

            graphUpdates.push({
                $updateItems: {
                    $where: { '@id': this.url },
                    $update: this.convertEngineUpdatesToJsonLD(modelUpdates, compactIRIs),
                },
            });
        }

        this._removedResourceUrls.forEach((removedResourceUrl) =>
            graphUpdates.push({
                $updateItems: {
                    $where: { '@id': removedResourceUrl },
                    $unset: true,
                },
            }));

        return graphUpdates.length === 1
            ? { '@graph': graphUpdates[0] as EngineAttributeUpdateOperation }
            : { '@graph': { $apply: graphUpdates } };
    }

    protected async parseEngineDocumentAttributes(
        id: Key,
        document: EngineDocument,
        resourceId?: string,
    ): Promise<Attributes> {
        return this.parseEngineDocumentAttributesFromJsonLD(document, resourceId || (id as string));
    }

    protected castAttribute(value: unknown, options: ModelCastAttributeOptions = {}): unknown {
        const prepareValue = () => {
            const isNullOrUndefined = typeof value === 'undefined' || value === null;

            switch (options.definition?.type) {
                case FieldType.Array: {
                    const arrayValue = isNullOrUndefined ? [] : arrayFrom(value);
                    const uniqueArrayValue = arrayUnique(arrayValue);

                    if (arrayValue.length !== uniqueArrayValue.length) {
                        // eslint-disable-next-line no-console
                        console.warn('An array field had duplicate values, this is not supported in Solid models.');
                    }

                    return uniqueArrayValue;
                }
                case FieldType.Any:
                    if (!Array.isArray(value)) return value;

                    if (value.length === 0) return undefined;

                    if (value.length === 1) return value[0];

                    break;
            }

            return isNullOrUndefined ? undefined : value;
        };

        return super.castAttribute(prepareValue(), options);
    }

    protected newUrl(documentUrl?: string, resourceHash?: string | null): string {
        documentUrl = documentUrl ?? this.newUrlDocumentUrl();
        resourceHash = resourceHash ?? this.newUrlResourceHash();

        return resourceHash ? `${documentUrl}#${resourceHash}` : documentUrl;
    }

    protected newUrlDocumentUrl(): string {
        const slug = this._sourceSubject?.documentName ?? this.newUrlDocumentUrlSlug() ?? uuid();

        return urlResolve(this.static('collection'), slug);
    }

    protected newUrlDocumentUrlSlug(): string | null {
        const slugField = this.static('slugField');
        const slugFieldValue = slugField && this.getAttribute<string>(slugField);

        return (slugFieldValue && stringToSlug(slugFieldValue)) ?? null;
    }

    protected newUrlResourceHash(): string | null {
        return this._sourceSubject?.resourceHash ?? this.static('defaultResourceHash');
    }

    protected newUniqueUrl(url?: string): string {
        url = url ?? this.newUrl();

        const fragment = urlParse(url)?.fragment;
        const documentUrl = urlRoute(url);

        return `${documentUrl}-${shortId()}${fragment ? `#${fragment}` : ''}`;
    }

    protected guessCollection(): string | undefined {
        if (!this.url) return;

        return urlParentDirectory(this.url) ?? undefined;
    }

    protected mintDocumentModelsKeys(models: SolidModel[]): void {
        const documentUrl = this.requireDocumentUrl();
        const documentExists = this._documentExists;

        // Mint primary keys
        for (const documentModel of models) {
            if (documentModel.url) continue;

            documentModel.mintUrl(documentUrl, documentExists, uuid());
        }

        // Set foreign keys
        for (const documentModel of models) {
            for (const relation of Object.values(documentModel._relations)) {
                if (!relation.enabled) {
                    continue;
                }

                relation.getLoadedModels().forEach((model) => relation.setForeignAttributes(model));
            }
        }
    }

}
