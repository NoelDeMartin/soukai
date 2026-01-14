import { MagicObject, fail, objectOnly, stringToCamelCase, uuid } from '@noeldemartin/utils';
import { RDFNamedNode, jsonldToQuads, quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { NamedNode } from '@rdfjs/types';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireEngine } from 'soukai-bis/engines/state';
import { RDF_TYPE } from './constants';
import { createFromRDF } from './concerns/creates-from-rdf';
import { serializeToRDF } from './concerns/serializes-to-rdf';
import type { Schema } from './schema';
import type { BootedModelClass, MintedModel, ModelConstructor } from './types';

export default class Model<
    Attributes extends Record<string, unknown> = Record<string, unknown>,
    Field extends string = Exclude<keyof Attributes, number | symbol>,
> extends MagicObject {

    public static schema: Schema;
    protected static _collection?: string;
    protected static _modelName?: string;
    private static __booted: boolean = false;

    public static get collection(): string {
        return this._collection ?? this.booted()._collection;
    }

    public static get modelName(): string {
        return this._modelName ?? this.booted()._modelName;
    }

    public static boot<T extends typeof Model>(this: T, name?: string): void {
        if (this.__booted) {
            throw new SoukaiError(`${this.name} model already booted`);
        }

        this._modelName ??= name ?? this.name;
        this._collection ??= `solid://${stringToCamelCase(this._modelName)}s/`;
        this.__booted = true;
    }

    public static reset(): void {
        this.__booted = false;
    }

    public static newInstance<T extends Model>(
        this: ModelConstructor<T>,
        ...params: ConstructorParameters<ModelConstructor<T>>
    ): T {
        return new this(...params);
    }

    public static async all<T extends Model>(
        this: ModelConstructor<T>,
        containerUrl: string,
    ): Promise<MintedModel<T>[]> {
        const engine = requireEngine();
        const documents = await engine.readManyDocuments(containerUrl);
        const models = await Promise.all(
            Object.entries(documents).map(([url, document]) => this.createFromJsonLD(document, { url })),
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

    public static async createFromJsonLD<T extends Model>(
        this: ModelConstructor<T>,
        json: JsonLD,
        options: { url?: string } = {},
    ): Promise<MintedModel<T> | null> {
        const url = options.url ?? json['@id'] ?? fail<string>('JsonLD is missing @id');
        const quads = await jsonldToQuads(json);
        const subject = new RDFNamedNode(url);
        const isType = (rdfClass: NamedNode) =>
            quads.some(
                (q) =>
                    q.subject.value === subject.value &&
                    q.predicate.value === RDF_TYPE &&
                    q.object.value === rdfClass.value,
            );

        if (!this.schema.rdfClasses.some(isType)) {
            return null;
        }

        return createFromRDF<T>(this, url, quads);
    }

    public static<T extends typeof Model>(): T;
    public static<T extends typeof Model, K extends keyof T>(property: K): T[K];
    public static<T extends typeof Model, K extends keyof T>(property?: K): T | T[K] {
        return super.static<T, K>(property as K);
    }

    private static booted<T extends typeof Model>(this: T): BootedModelClass<T> {
        if (!this.__booted) {
            this._modelName ??= this.name;
            this._collection ??= `solid://${stringToCamelCase(this._modelName)}s/`;
            this.__booted = true;
        }

        return this as BootedModelClass<T>;
    }

    declare public url?: string;
    private __exists: boolean = false;
    private __attributes: Attributes;
    private __dirtyAttributes: Set<Field> = new Set();

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

    public isDirty(field?: Field): boolean {
        if (field) {
            return this.__dirtyAttributes.has(field);
        }

        return this.__dirtyAttributes.size > 0;
    }

    public exists(): boolean {
        return this.__exists;
    }

    public setExists(exists: boolean): void {
        this.__exists = exists;
    }

    public async save(): Promise<MintedModel<this>> {
        this.url ??= this.mintUrl();

        const graph = await this.toJsonLD();

        if (this.__exists) {
            const dirtyProperties = Array.from(this.__dirtyAttributes)
                .map((attribute) => this.static().schema.rdfFieldProperties[attribute]?.value)
                .filter((property): property is string => !!property);

            await requireEngine().updateDocument(this.url, graph, dirtyProperties);
        } else {
            await requireEngine().createDocument(this.url, graph);

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
        Object.keys(parsedAttributes).forEach((field) => this.__dirtyAttributes.add(field as Field));

        return this.save();
    }

    public async toJsonLD(): Promise<JsonLD> {
        return quadsToJsonLD(serializeToRDF(this));
    }

    public async toTurtle(): Promise<string> {
        return quadsToTurtle(serializeToRDF(this));
    }

    protected __get(property: string): unknown {
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
        return `${this.static().collection}${uuid()}`;
    }

    private parseAttribute<T extends Field>(field: T, value: unknown): Attributes[T] {
        return this.static().schema.fields.def.shape[field]?.parse(value) as Attributes[T];
    }

    private parseAttributes(values: unknown): Attributes {
        return this.static().schema.fields.parse(values) as Attributes;
    }

    private isField(property: string): property is Field {
        return property in this.static().schema.fields.def.shape;
    }

}
