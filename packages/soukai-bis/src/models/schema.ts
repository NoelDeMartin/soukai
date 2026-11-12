import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import type { JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import { arrayFilter, arrayUnique } from '@noeldemartin/utils';
import type { Override } from '@noeldemartin/utils';
import type { NamedNode, Quad } from '@rdfjs/types';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getSchema, SCHEMA } from 'soukai-bis/models/internals/model';
import { deepMeta, rdfProperties } from 'soukai-bis/zod/soukai';
import type { SafeInferObject } from 'soukai-bis/zod/types';
import { object, url } from 'zod';
import type { ZodObject, ZodType, z } from 'zod';

import { allOf } from './matching/fluent';
import type { RdfClassesDefinition } from './matching/fluent';
import RDFClassesMatcher from './matching/RDFClassesMatcher';
import Model from './Model';
import type { ModelConstructorOptions } from './Model';
import HasOneRelation from './relations/HasOneRelation';
import OperationsRelation from './relations/OperationsRelation';
import { SchemaRelationDefinition } from './relations/schema';
import type { SchemaComputedAttributeDefinition, SchemaModelRelations, SchemaRelations } from './relations/schema';
import type { ModelConstructor, ModelInstanceType, ModelWithUrl, ModelsCache } from './types';
import { isModelClass } from './utils';

declare const SCHEMA_FIELDS_MARKER: unique symbol;
declare const SCHEMA_RELATIONS_MARKER: unique symbol;

function getRdfClassesDefinition(config: SchemaConfig): RdfClassesDefinition {
    if (!config.rdfClasses || Array.isArray(config.rdfClasses)) {
        return allOf(arrayFilter([config.rdfClass, ...(config.rdfClasses ?? [])]));
    }

    if (config.rdfClass && config.rdfClasses.match === 'any') {
        throw new SoukaiError("Can't define a schema using both rdfClass and anyOf() in rdfClasses.");
    }

    return config.rdfClass ? allOf([config.rdfClass, ...config.rdfClasses.classes]) : config.rdfClasses;
}

export type Schema<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
> = {
    fields: ZodObject<TFields>;
    relations: TRelations;
    timestamps: boolean;
    history: boolean;
    tombstone: boolean;
    rdfContext: { default: string } & Record<string, string>;
    rdfClasses: RDFClassesMatcher;
    rdfDefaultResourceHash: string;
    rdfFieldProperties: Record<keyof TFields, NamedNode[]>;
    computed: Record<string, SchemaComputedAttributeDefinition>;
    hooks: SchemaHooks;
    slugField?: string & keyof TFields;
};

export interface SchemaHookContext {
    quads?: Quad[];
}

export interface SchemaHooks<TModel extends Model = Model, TAttributes = Record<string, unknown>> {
    beforeInitialize?(this: void, attributes: TAttributes, context: SchemaHookContext): void;
    beforeSave?(this: TModel): void | Promise<void>;
}

export type SchemaHookAttributes<
    TFields extends SchemaFields = SchemaFields,
    TBaseClass extends ModelConstructor = typeof Model,
> = Partial<z.input<ZodObject<ExtendedSchemaFields<TFields, TBaseClass>>>> & Record<string, unknown>;

export type SchemaModelInput<
    TFields extends SchemaFields = SchemaFields,
    TBaseClass extends ModelConstructor = typeof Model,
> = (keyof TFields extends never ? {} : z.input<ZodObject<TFields>>) &
    (typeof Model extends TBaseClass ? {} : ConstructorParameters<TBaseClass>[0]) & {
        url?: string;
    };
export type SchemaModelAttributes<T extends SchemaFields = SchemaFields> = keyof T extends never
    ? { url?: string }
    : z.infer<ZodObject<T>> & { url?: string };

export type BaseSchemaFields<TBaseClass> = TBaseClass extends {
    [SCHEMA_FIELDS_MARKER]?: infer TBaseFields extends SchemaFields;
}
    ? TBaseFields
    : {};

export type BaseSchemaRelations<TBaseClass> = TBaseClass extends {
    [SCHEMA_RELATIONS_MARKER]?: infer TBaseRelations extends SchemaRelations;
}
    ? TBaseRelations
    : {};

export type ExtendedSchemaFields<
    TFields extends SchemaFields = SchemaFields,
    TBaseClass extends ModelConstructor = typeof Model,
> = typeof Model extends TBaseClass ? TFields : Override<BaseSchemaFields<TBaseClass>, TFields>;

export type ExtendedSchemaRelations<
    TRelations extends SchemaRelations = SchemaRelations,
    TBaseClass extends ModelConstructor = typeof Model,
> = typeof Model extends TBaseClass ? TRelations : Override<BaseSchemaRelations<TBaseClass>, TRelations>;

export type SchemaModel<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
    TBaseClass extends ModelConstructor = typeof Model,
> = (typeof Model extends TBaseClass
    ? Model<SchemaModelAttributes<TFields>, TRelations>
    : Model<
          SchemaModelAttributes<ExtendedSchemaFields<TFields, TBaseClass>>,
          ExtendedSchemaRelations<TRelations, TBaseClass>
      > &
          InstanceType<TBaseClass>) &
    SafeInferObject<TFields> &
    SchemaModelRelations<TRelations>;

export type SchemaModelClass<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
    TBaseClass extends ModelConstructor = typeof Model,
> = Override<
    TBaseClass,
    {
        [SCHEMA_FIELDS_MARKER]?: ExtendedSchemaFields<TFields, TBaseClass>;
        [SCHEMA_RELATIONS_MARKER]?: ExtendedSchemaRelations<TRelations, TBaseClass>;

        new (
            attributes?: SchemaModelInput<TFields, TBaseClass>,
            options?: ModelConstructorOptions,
        ): SchemaModel<TFields, TRelations, TBaseClass>;
        newInstance<This>(
            this: This,
            attributes?: SchemaModelInput<TFields, TBaseClass>,
            options?: ModelConstructorOptions,
        ): ModelInstanceType<This>;
        create<This>(
            this: This,
            attributes?: SchemaModelInput<TFields, TBaseClass>,
        ): Promise<ModelWithUrl<ModelInstanceType<This>>>;
        createAt<This>(
            this: This,
            containerUrl: string,
            attributes?: SchemaModelInput<TFields, TBaseClass>,
        ): Promise<ModelWithUrl<ModelInstanceType<This>>>;
        createFromJsonLD<This>(
            this: This,
            json: JsonLD,
            options?: { url?: string },
        ): Promise<ModelWithUrl<ModelInstanceType<This>> | null>;
        createFromRDF<This>(
            this: This,
            quads: Quad[],
            options: { url: string; modelsCache?: ModelsCache },
        ): Promise<ModelWithUrl<ModelInstanceType<This>> | null>;
        createManyFromDocument<This>(
            this: This,
            document: SolidDocument,
        ): Promise<ModelWithUrl<ModelInstanceType<This>>[]>;
    }
>;

export type SchemaFields = Record<string, ZodType>;

export interface SchemaConfig<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = {},
    TBaseClass extends ModelConstructor = typeof Model,
> {
    history?: boolean;
    tombstone?: boolean;
    timestamps?: boolean;
    rdfContext?: string;
    rdfContexts?: Record<string, string>;
    rdfClass?: string;
    rdfClasses?: string[] | RdfClassesDefinition;
    rdfDefaultResourceHash?: string;
    fields?: TFields;
    relations?: TRelations;
    hooks?: SchemaHooks<SchemaModel<TFields, TRelations, TBaseClass>, SchemaHookAttributes<TFields, TBaseClass>>;
}

export function defineSchema<
    TFields extends SchemaFields = {},
    TRelations extends SchemaRelations = {},
    TBaseClass extends ModelConstructor = typeof Model,
>(
    baseClass: TBaseClass,
    config?: SchemaConfig<TFields, TRelations, TBaseClass>,
): SchemaModelClass<TFields, TRelations, TBaseClass>;
export function defineSchema<TFields extends SchemaFields = {}, TRelations extends SchemaRelations = {}>(
    config: SchemaConfig<TFields, TRelations>,
): SchemaModelClass<TFields, TRelations>;
export function defineSchema<
    TFields extends SchemaFields = {},
    TRelations extends SchemaRelations = {},
    TBaseClass extends ModelConstructor = typeof Model,
>(
    baseClassOrConfig: TBaseClass | SchemaConfig<TFields, TRelations, TBaseClass>,
    configArg?: SchemaConfig<TFields, TRelations, TBaseClass>,
): SchemaModelClass<TFields, TRelations, TBaseClass> {
    const baseClass = isModelClass(baseClassOrConfig) ? baseClassOrConfig : null;
    const baseSchema = baseClass ? getSchema(baseClass) : undefined;
    const config = isModelClass(baseClassOrConfig)
        ? (configArg ?? ({ fields: {} } as SchemaConfig<TFields, TRelations, TBaseClass>))
        : baseClassOrConfig;
    const fields = config.fields ?? ({} as TFields);
    const rdfContext = {
        default: 'http://www.w3.org/ns/solid/terms#',
        ...baseSchema?.rdfContext,
        ...(config.rdfContext ? { default: config.rdfContext } : {}),
        ...(config.rdfContexts ? config.rdfContexts : {}),
    };
    const { default: defaultPrefix, ...extraContext } = rdfContext;
    const relations = { ...baseSchema?.relations, ...config.relations };
    const expand = (iri: string) => new RDFNamedNode(expandIRI(iri, { defaultPrefix, extraContext }));
    const rdfClassesDefinition = getRdfClassesDefinition(config);
    const ownRdfClasses = arrayUnique(rdfClassesDefinition.classes.map((rdfClass) => expand(rdfClass).value));
    const rdfFieldProperties: Record<string, NamedNode[]> = {
        ...baseSchema?.rdfFieldProperties,
        ...Object.fromEntries(
            Object.entries(fields).map(([field, definition]) => [
                field,
                (rdfProperties(definition) ?? [field]).map(expand),
            ]),
        ),
    };
    const timestamps = config.timestamps ?? baseSchema?.timestamps ?? true;
    const history = config.history ?? baseSchema?.history ?? false;
    const tombstone = config.tombstone ?? config.history ?? baseSchema?.tombstone ?? false;

    if (timestamps) {
        relations.metadata = new SchemaRelationDefinition('Metadata', HasOneRelation, {
            foreignKey: 'resourceUrl',
        }).usingSameDocument();
    }

    if (history) {
        relations.operations = new SchemaRelationDefinition('Operation', OperationsRelation, {
            foreignKey: 'resourceUrl',
        })
            .usingSameDocument()
            .autoload(false);
    }

    if (tombstone) {
        relations.tombstone = new SchemaRelationDefinition('Tombstone', HasOneRelation, {
            foreignKey: 'resourceUrl',
        })
            .usingSameDocument()
            .autoload(false);
    }

    return class extends (baseClass ?? Model) {
        public static [SCHEMA] = {
            fields: baseSchema?.fields.extend(fields) ?? object(fields).extend({ url: url().optional() }),
            relations,
            timestamps,
            history,
            tombstone,
            rdfContext,
            computed: {},
            hooks: { ...baseSchema?.hooks, ...(config.hooks as SchemaHooks) },
            rdfDefaultResourceHash: config.rdfDefaultResourceHash ?? baseSchema?.rdfDefaultResourceHash ?? 'it',
            slugField:
                Object.entries(fields).find(([_, definition]) => deepMeta(definition, 'rdfSlug'))?.[0] ??
                baseSchema?.slugField,
            rdfClasses:
                ownRdfClasses.length > 0
                    ? new RDFClassesMatcher(
                          rdfClassesDefinition.match,
                          ownRdfClasses.map((rdfClass) => new RDFNamedNode(rdfClass)),
                      )
                    : (baseSchema?.rdfClasses.clone() ?? new RDFClassesMatcher('all', [])),
            rdfFieldProperties,
        };
    } as unknown as SchemaModelClass<TFields, TRelations, TBaseClass>;
}
