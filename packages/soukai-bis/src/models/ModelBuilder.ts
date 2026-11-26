import { jsonldToQuads, turtleToQuads } from '@noeldemartin/solid-utils';
import type { JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import { fail, isObject, isTruthy, urlResolve, urlRoute } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import {
    findMatchingRDFResourceUrls,
    hydrateModelFromRDF,
    hydrateModelsFromRDF,
    resetModelGraph,
} from 'soukai-bis/models/concerns/rdf';
import { getDocumentQuads, normalizeBlankNodes } from 'soukai-bis/models/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import type { SaveOptions } from 'soukai-bis/models/Model';
import type { ModelConstructor, ModelWithUrl, ModelsCache } from 'soukai-bis/models/types';

const DEFAULT_NEW_BASE_IRI = 'local://document';

type LoadQuadsOptions = {
    url?: string;
    defaultBaseIRI?: string;
}

export interface FromRDFOptions {
    sourceDocumentUrl?: string;
}

export interface FromTurtleOptions {
    baseIRI?: string;
}

export interface FromJsonLDOptions {
    baseIRI?: string;
}

export interface FindFromRDFOptions {
    modelsCache?: ModelsCache;
    includeSoftDeleted?: boolean;
}

export interface NewFromRDFOptions {
    includeSoftDeleted?: boolean;
}

export type CreateFromRDFOptions = NewFromRDFOptions & SaveOptions;

export type FindFromRDFArgs<HasDefaultUrl extends boolean> = HasDefaultUrl extends true
    ? [url?: string, options?: FindFromRDFOptions] | [options: FindFromRDFOptions]
    : [url: string, options?: FindFromRDFOptions];

export type NewFromRDFArgs = [url?: string, options?: NewFromRDFOptions] | [options: NewFromRDFOptions];

export type CreateFromRDFArgs = [url?: string, options?: CreateFromRDFOptions] | [options: CreateFromRDFOptions];

export default class ModelBuilder<T extends Model, HasDefaultUrl extends boolean = false> {
    public static fromRDF<T extends Model>(
        modelClass: ModelConstructor<T>,
        quads: Quad[],
        options: FromRDFOptions = {},
    ): ModelBuilder<T, false> {
        return new ModelBuilder(modelClass, {
            loadQuads: () => quads,
            sourceDocumentUrl: options.sourceDocumentUrl,
        });
    }

    public static fromTurtle<T extends Model>(
        modelClass: ModelConstructor<T>,
        turtle: string,
        options: FromTurtleOptions = {},
    ): ModelBuilder<T, false> {
        return new ModelBuilder(modelClass, {
            loadQuads: ({ url, defaultBaseIRI }: LoadQuadsOptions = {}) =>
                turtleToQuads(turtle, { baseIRI: options.baseIRI ?? (url ? urlRoute(url) : defaultBaseIRI) }),
        });
    }

    public static fromJsonLD<T extends Model>(
        modelClass: ModelConstructor<T>,
        json: JsonLD,
        options: FromJsonLDOptions = {},
    ): ModelBuilder<T, true> {
        const rawId = json['@id'];
        const defaultUrl =
            rawId && !rawId.startsWith('_:') && options.baseIRI ? urlResolve(options.baseIRI, rawId) : rawId;

        return new ModelBuilder(modelClass, {
            loadQuads: ({ defaultBaseIRI }: LoadQuadsOptions = {}) =>
                jsonldToQuads(json, options.baseIRI ?? defaultBaseIRI),
            defaultUrl,
            missingUrlError: 'JsonLD is missing @id',
        });
    }

    public static fromDocument<T extends Model>(
        modelClass: ModelConstructor<T>,
        document: SolidDocument,
    ): ModelBuilder<T, false> {
        return new ModelBuilder(modelClass, {
            loadQuads: () => getDocumentQuads(document),
        });
    }

    private readonly modelClass: ModelConstructor<T>;
    private readonly loadQuads: (options?: LoadQuadsOptions) => Quad[] | Promise<Quad[]>;
    private readonly defaultUrl?: string;
    private readonly sourceDocumentUrl?: string;
    private readonly missingUrlError: string;

    private constructor(
        modelClass: ModelConstructor<T>,
        config: {
            loadQuads: (options?: LoadQuadsOptions) => Quad[] | Promise<Quad[]>;
            defaultUrl?: string;
            sourceDocumentUrl?: string;
            missingUrlError?: string;
        },
    ) {
        this.modelClass = modelClass;
        this.loadQuads = config.loadQuads;
        this.defaultUrl = config.defaultUrl;
        this.sourceDocumentUrl = config.sourceDocumentUrl;
        this.missingUrlError = config.missingUrlError ?? 'Resource url is required';
    }

    public async find(...args: FindFromRDFArgs<HasDefaultUrl>): Promise<ModelWithUrl<T> | null> {
        const { url: providedUrl, options } = this.parseOptionalUrlArgs<FindFromRDFOptions>(
            args as [url?: string, options?: FindFromRDFOptions] | [options: FindFromRDFOptions],
        );
        const url = providedUrl ?? this.defaultUrl ?? fail<string>(this.missingUrlError);
        const quads = await this.loadQuads({ url });

        return hydrateModelFromRDF(this.modelClass, quads, url, {
            ...options,
            sourceDocumentUrl: this.sourceDocumentUrl,
        });
    }

    public async all(options: FindFromRDFOptions = {}): Promise<ModelWithUrl<T>[]> {
        const quads = await this.loadQuads();

        return hydrateModelsFromRDF(this.modelClass, quads, {
            ...options,
            sourceDocumentUrl: this.sourceDocumentUrl,
        });
    }

    public async newInstance(...args: NewFromRDFArgs): Promise<T | null> {
        const { url: providedUrl, options } = this.parseOptionalUrlArgs<NewFromRDFOptions>(args);
        const rawDefaultUrl = this.defaultUrl && !this.defaultUrl.startsWith('_:') ? this.defaultUrl : undefined;
        const defaultUrl = rawDefaultUrl ? urlResolve(DEFAULT_NEW_BASE_IRI, rawDefaultUrl) : undefined;
        const quads = normalizeBlankNodes(
            await this.loadQuads({ url: providedUrl ?? defaultUrl, defaultBaseIRI: DEFAULT_NEW_BASE_IRI }),
        );
        const url = providedUrl ?? defaultUrl ?? findMatchingRDFResourceUrls(this.modelClass, quads, options)[0];

        if (!url) {
            return null;
        }

        const instance = await hydrateModelFromRDF(this.modelClass, quads, url, options);

        if (!instance) {
            return null;
        }

        resetModelGraph(instance);

        return instance;
    }

    public async newInstances(options: NewFromRDFOptions = {}): Promise<T[]> {
        const quads = normalizeBlankNodes(await this.loadQuads({ defaultBaseIRI: DEFAULT_NEW_BASE_IRI }));
        const matchingUrls = findMatchingRDFResourceUrls(this.modelClass, quads, options);
        const instances = (
            await Promise.all(
                matchingUrls.map((url) =>
                    hydrateModelFromRDF(this.modelClass, quads, url, {
                        includeSoftDeleted: options.includeSoftDeleted,
                    }),
                ),
            )
        ).filter(isTruthy);

        instances.forEach((instance) => resetModelGraph(instance));

        return instances;
    }

    public async create(...args: CreateFromRDFArgs): Promise<ModelWithUrl<T> | null> {
        const { url, options } = this.parseOptionalUrlArgs<CreateFromRDFOptions>(args);
        const { includeSoftDeleted, ...saveOptions } = options;
        const instance = await this.newInstance(url, { includeSoftDeleted });

        if (!instance) {
            return null;
        }

        return instance.save(saveOptions);
    }

    public async createMany(options: CreateFromRDFOptions = {}): Promise<ModelWithUrl<T>[]> {
        const { includeSoftDeleted, ...saveOptions } = options;
        const instances = await this.newInstances({ includeSoftDeleted });

        return Promise.all(instances.map((instance) => instance.save(saveOptions)));
    }

    private parseOptionalUrlArgs<TOptions extends object>(
        args: [url?: string, options?: TOptions] | [options: TOptions],
    ): { url?: string; options: TOptions } {
        const [first, second] = args;

        if (isObject(first)) {
            return { options: first as TOptions };
        }

        return { url: first as string | undefined, options: (second ?? {}) as TOptions };
    }
}
