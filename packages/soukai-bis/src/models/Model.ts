import {
    MagicObject,
    arrayUnique,
    fail,
    isInstanceOf,
    objectOnly,
    required,
    stringToCamelCase,
    tap,
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

import { createFromRDF, serializeToRDF } from './concerns/rdf';
import { getDirtyUpdates } from './concerns/crdts';
import { isModelClass } from './utils';
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
        const matchingDocuments = await Promise.all(
            Object.entries(documents).map(async ([_, document]) => {
                const quads = await jsonldToQuads(document);
                const matches = arrayUnique(
                    quads
                        .filter(
                            (q) =>
                                RDF_TYPE_PREDICATE.equals(q.predicate) &&
                                this.schema.rdfClasses.some((rdfClass) => rdfClass.equals(q.object)),
                        )
                        .map((q) => q.subject.value),
                );

                return matches.map((subject) => [subject, quads.filter((q) => q.subject.value === subject)] as const);
            }),
        );
        const models = await Promise.all(
            matchingDocuments.flat().map(([subject, quads]) => this.createFromRDF(quads, { url: subject })),
        );

        return models.filter((model) => model !== null) as MintedModel<T>[];
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
    private __attributes: Attributes;
    private __dirtyAttributes: Set<FieldName> = new Set();
    private __relations: Record<string, Relation> = {};

    public constructor(attributes: Record<string, unknown> = {}, exists: boolean = false) {
        super();

        if (this.static().isConjuring()) {
            this.__attributes = {} as unknown as Attributes;

            return;
        }

        this.__exists = exists;
        this.__attributes = this.parseAttributes(attributes);
    }

    public getAttributes(): Attributes {
        return this.__attributes;
    }

    public getAttribute(field: FieldName): unknown {
        return this.__attributes[field];
    }

    public getRelation(name: RelationName): Relation {
        const relation = required(
            this.static().schema.relations[name],
            `Relation '${name}' is not defined in the ${this.static().modelName} model.`,
        );

        if (!isModelClass(relation.related)) {
            const related = (relation.related as () => ModelConstructor)();

            if (!isModelClass(related)) {
                throw new SoukaiError(
                    `Relation '${name}' for ${this.static().modelName} model is not defined correctly, ` +
                        'related value is not a model class.',
                );
            }

            relation.related = related;
        }

        return tap(
            relation.relationClass.newInstance(this, relation.related, {
                foreignKeyName: relation.foreignKey,
                localKeyName: relation.localKey,
            }),
            (instance) => void (this.__relations[name] = instance),
        );
    }

    public async loadRelation(name: RelationName): Promise<void> {
        await this.getRelation(name).load();
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

    public isDirty(field?: FieldName): boolean {
        if (field) {
            return this.__dirtyAttributes.has(field);
        }

        return this.__dirtyAttributes.size > 0;
    }

    public exists(): this is MintedModel<this> {
        return this.__exists;
    }

    public setExists(exists: boolean): void {
        this.__exists = exists;
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
        this.url ??= this.mintUrl();

        const engine = requireEngine();
        const graph = await this.toJsonLD();

        if (this.exists()) {
            await engine.updateDocument(this.requireDocumentUrl(), getDirtyUpdates(this));
        } else {
            await engine.createDocument(this.requireDocumentUrl(), graph);

            this.__exists = true;
        }

        this.__dirtyAttributes.clear();

        return this as MintedModel<this>;
    }

    public update(attributes: Partial<Attributes>): Promise<MintedModel<this>> {
        const updateSchemas = objectOnly(this.static().schema.fields.def.shape, Object.keys(attributes));
        const parsedAttributes = Object.fromEntries(
            Object.entries(updateSchemas).map(([field, fieldSchema]) => [field, fieldSchema.parse(attributes[field])]),
        );

        Object.assign(this.__attributes, parsedAttributes);
        Object.keys(parsedAttributes).forEach((field) => this.__dirtyAttributes.add(field as FieldName));

        return this.save();
    }

    public async toJsonLD(): Promise<JsonLD> {
        return quadsToJsonLD(serializeToRDF(this));
    }

    public async toTurtle(): Promise<string> {
        return quadsToTurtle(serializeToRDF(this));
    }

    protected __get(property: string): unknown {
        if (property in this.__relations) {
            return this.__relations[property]?.related;
        }

        return this.__attributes[property];
    }

    protected __set(property: string, value: unknown): void {
        if (!this.isField(property)) {
            return;
        }

        this.__attributes[property] = this.parseAttribute(property, value);
        this.__dirtyAttributes.add(property);
    }

    protected mintUrl(): string {
        return `${this.static().defaultContainerUrl}${uuid()}`;
    }

    private parseAttribute<T extends FieldName>(field: T, value: unknown): Attributes[T] {
        return this.static().schema.fields.def.shape[field]?.parse(value) as Attributes[T];
    }

    private parseAttributes(values: unknown): Attributes {
        return this.static().schema.fields.parse(values) as Attributes;
    }

    private isField(property: string): property is FieldName {
        return property in this.static().schema.fields.def.shape;
    }

}
