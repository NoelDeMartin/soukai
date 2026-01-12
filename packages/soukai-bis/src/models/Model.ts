import { MagicObject, fail, stringToCamelCase, uuid } from '@noeldemartin/utils';
import { RDFNamedNode, jsonldToQuads, quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { NamedNode } from '@rdfjs/types';

import { requireEngine } from 'soukai-bis/engines/state';
import { RDF_TYPE } from './constants';
import { createFromRDF } from './concerns/creates-from-rdf';
import { serializeToRDF } from './concerns/serializes-to-rdf';
import type { Schema } from './schema';
import type { BootedModelClass, MintedModel, ModelConstructor } from './types';

export default class Model extends MagicObject {

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
            throw new Error(`${this.name} model already booted`);
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
    private __attributes: Record<string, unknown>;

    public constructor(attributes: Record<string, unknown> = {}, exists: boolean = false) {
        super();

        if (this.static().isConjuring()) {
            this.__attributes = {};

            return;
        }
        this.__exists = exists;
        this.__attributes = this.static().schema.fields.parse(attributes);
    }

    public getAttributes(): Record<string, unknown> {
        return this.__attributes;
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

        this.__exists
            ? await requireEngine().updateDocument(this.url, graph)
            : await requireEngine().createDocument(this.url, graph);

        this.__exists = true;

        return this as MintedModel<this>;
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

    protected mintUrl(): string {
        return `${this.static().collection}${uuid()}`;
    }

}
