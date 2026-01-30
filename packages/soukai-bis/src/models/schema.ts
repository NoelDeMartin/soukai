import { object, url } from 'zod';
import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import type { JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import type { NamedNode, Quad } from '@rdfjs/types';
import type { Override } from '@noeldemartin/utils';
import type { ZodObject, ZodType, z } from 'zod';

import type { SafeInferObject } from 'soukai-bis/zod/types';

import HasOneRelation from './relations/HasOneRelation';
import HasManyRelation from './relations/HasManyRelation';
import Model from './Model';
import { SchemaRelationDefinition } from './relations/schema';
import { isModelClass } from './utils';
import { requireBootedModel } from './registry';
import type { ModelConstructor, ModelInstanceType, ModelWithUrl } from './types';
import type { SchemaModelRelations, SchemaRelations } from './relations/schema';

export type Schema<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
> = {
    fields: ZodObject<TFields>;
    relations: TRelations;
    timestamps: boolean;
    history: boolean;
    rdfContext: { default: string } & Record<string, string>;
    rdfClasses: NamedNode[];
    rdfDefaultResourceHash: string;
    rdfFieldProperties: Record<keyof TFields, NamedNode>;
    slugField?: string & keyof TFields;
};

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

export type SchemaModel<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
    TBaseClass extends ModelConstructor = typeof Model,
> = (typeof Model extends TBaseClass
    ? Model<SchemaModelAttributes<TFields>, TRelations>
    : InstanceType<TBaseClass> & Model<SchemaModelAttributes<TFields>, TRelations>) &
    SafeInferObject<TFields> &
    SchemaModelRelations<TRelations>;

export type SchemaModelClass<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
    TBaseClass extends ModelConstructor = typeof Model,
> = Override<
    TBaseClass,
    {
        new (
            attributes?: SchemaModelInput<TFields, TBaseClass>,
            exists?: boolean
        ): SchemaModel<TFields, TRelations, TBaseClass>;
        newInstance<This>(
            this: This,
            attributes?: SchemaModelInput<TFields, TBaseClass>,
            exists?: boolean
        ): ModelInstanceType<This>;
        create<This>(
            this: This,
            attributes?: SchemaModelInput<TFields, TBaseClass>
        ): Promise<ModelWithUrl<ModelInstanceType<This>>>;
        createAt<This>(
            this: This,
            containerUrl: string,
            attributes?: SchemaModelInput<TFields, TBaseClass>
        ): Promise<ModelWithUrl<ModelInstanceType<This>>>;
        createFromJsonLD<This>(
            this: This,
            json: JsonLD,
            options?: { url?: string }
        ): Promise<ModelWithUrl<ModelInstanceType<This>> | null>;
        createFromRDF<This>(
            this: This,
            quads: Quad[],
            options?: { url?: string }
        ): Promise<ModelWithUrl<ModelInstanceType<This>> | null>;
        createManyFromDocument<This>(
            this: This,
            document: SolidDocument
        ): Promise<ModelWithUrl<ModelInstanceType<This>>[]>;
    }
>;

export type SchemaFields = Record<string, ZodType>;

export interface SchemaConfig<TFields extends SchemaFields = SchemaFields, TRelations extends SchemaRelations = {}> {
    history?: boolean;
    timestamps?: boolean;
    rdfContext?: string;
    rdfClass?: string;
    rdfDefaultResourceHash?: string;
    fields?: TFields;
    relations?: TRelations;
}

export function defineSchema<
    TFields extends SchemaFields = {},
    TRelations extends SchemaRelations = {},
    TBaseClass extends ModelConstructor = typeof Model,
>(baseClass: TBaseClass, config?: SchemaConfig<TFields, TRelations>): SchemaModelClass<TFields, TRelations, TBaseClass>;
export function defineSchema<TFields extends SchemaFields = {}, TRelations extends SchemaRelations = {}>(
    config: SchemaConfig<TFields, TRelations>
): SchemaModelClass<TFields, TRelations>;
export function defineSchema<
    TFields extends SchemaFields = {},
    TRelations extends SchemaRelations = {},
    TBaseClass extends ModelConstructor = typeof Model,
>(
    baseClassOrConfig: TBaseClass | SchemaConfig<TFields, TRelations>,
    configArg?: SchemaConfig<TFields, TRelations>,
): SchemaModelClass<TFields, TRelations, TBaseClass> {
    const baseClass = isModelClass(baseClassOrConfig) ? baseClassOrConfig : null;
    const baseSchema = baseClass?.schema;
    const config = isModelClass(baseClassOrConfig)
        ? (configArg ?? ({ fields: {} } as SchemaConfig<TFields, TRelations>))
        : baseClassOrConfig;
    const fields = config.fields ?? ({} as TFields);
    const rdfContext = {
        default: 'solid',
        ...baseSchema?.rdfContext,
        ...(config.rdfContext ? { default: config.rdfContext } : {}),
    };
    const { default: defaultPrefix, ...extraContext } = rdfContext;
    const relations = { ...baseSchema?.relations, ...config.relations };
    const timestamps = config.timestamps ?? baseSchema?.timestamps ?? true;
    const history = config.history ?? baseSchema?.history ?? false;

    if (timestamps) {
        relations.metadata = new SchemaRelationDefinition(() => requireBootedModel('Metadata'), HasOneRelation, {
            foreignKey: 'resourceUrl',
        }).usingSameDocument();
    }

    if (history) {
        relations.operations = new SchemaRelationDefinition(() => requireBootedModel('Operation'), HasManyRelation, {
            foreignKey: 'resourceUrl',
        }).usingSameDocument();
    }

    return class extends (baseClass ?? Model) {

        public static schema = {
            fields: baseSchema?.fields.extend(fields) ?? object(fields).extend({ url: url().optional() }),
            relations,
            timestamps,
            history,
            rdfContext,
            rdfDefaultResourceHash: config.rdfDefaultResourceHash ?? baseSchema?.rdfDefaultResourceHash ?? 'it',
            slugField:
                Object.entries(fields).find(([_, definition]) => definition.deepMeta('rdfSlug'))?.[0] ??
                baseSchema?.slugField,
            rdfClasses: [
                ...(baseSchema?.rdfClasses ?? []),
                ...(config.rdfClass
                    ? [
                        new RDFNamedNode(
                            expandIRI(config.rdfClass, {
                                defaultPrefix,
                                extraContext,
                            }),
                        ),
                    ]
                    : []),
            ],
            rdfFieldProperties: {
                ...baseSchema?.rdfFieldProperties,
                ...Object.fromEntries(
                    Object.entries(fields).map(([field, definition]) => [
                        field,
                        new RDFNamedNode(
                            expandIRI(definition.rdfProperty() ?? field, {
                                defaultPrefix,
                                extraContext,
                            }),
                        ),
                    ]),
                ),
            },
        };
    
    } as unknown as SchemaModelClass<TFields, TRelations, TBaseClass>;
}
