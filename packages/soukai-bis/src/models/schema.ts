import { object, url } from 'zod';
import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { NamedNode } from '@rdfjs/types';
import type { Override } from '@noeldemartin/utils';
import type { ZodObject, ZodType, z } from 'zod';

import Model from './Model';
import type { MintedModel, ModelInstanceType } from './types';
import type { SchemaModelRelations, SchemaRelations } from './relations/schema';

export type Schema<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
> = {
    fields: ZodObject<TFields>;
    relations: TRelations;
    rdfContext: { default: string } & Record<string, string>;
    rdfClasses: NamedNode[];
    rdfDefaultResourceHash: string;
    rdfFieldProperties: Record<keyof TFields, NamedNode>;
};

export type SchemaModelInput<T extends SchemaFields = SchemaFields> = z.input<ZodObject<T>> & { url?: string };
export type SchemaModelAttributes<T extends SchemaFields = SchemaFields> = z.infer<ZodObject<T>> & { url?: string };

export type SchemaModel<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
> = Model<SchemaModelAttributes<TFields>, TRelations> & z.infer<ZodObject<TFields>> & SchemaModelRelations<TRelations>;

export type SchemaModelClass<
    TFields extends SchemaFields = SchemaFields,
    TRelations extends SchemaRelations = SchemaRelations,
> = Override<
    typeof Model,
    {
        new (attributes?: SchemaModelInput<TFields>, exists?: boolean): SchemaModel<TFields, TRelations>;
        newInstance<This>(
            this: This,
            attributes?: SchemaModelInput<TFields>,
            exists?: boolean
        ): ModelInstanceType<This>;
        create<This>(this: This, attributes?: SchemaModelInput<TFields>): Promise<MintedModel<ModelInstanceType<This>>>;
        createFromJsonLD<This>(
            this: This,
            json: JsonLD,
            options?: { url?: string }
        ): Promise<MintedModel<ModelInstanceType<This>> | null>;
    }
>;

export type SchemaFields = Record<string, ZodType>;

export interface SchemaConfig<TFields extends SchemaFields, TRelations extends SchemaRelations = SchemaRelations> {
    crdts?: boolean;
    rdfContext?: string;
    rdfClass?: string;
    rdfDefaultResourceHash?: string;
    fields: TFields;
    relations?: TRelations;
}

export function defineSchema<TFields extends SchemaFields, TRelations extends SchemaRelations>(
    config: SchemaConfig<TFields, TRelations>,
): SchemaModelClass<TFields, TRelations> {
    const rdfContext = config.rdfContext ? { default: config.rdfContext } : { default: 'solid' };
    const { default: defaultPrefix, ...extraContext } = rdfContext;

    return class extends Model<SchemaModelAttributes<TFields>, TRelations> {

        public static schema = {
            fields: object(config.fields).extend({ url: url().optional() }) as unknown as ZodObject,
            relations: config.relations ?? {},
            rdfContext,
            rdfDefaultResourceHash: config.rdfDefaultResourceHash ?? 'it',
            rdfClasses: config.rdfClass
                ? [
                    new RDFNamedNode(
                        expandIRI(config.rdfClass, {
                            defaultPrefix,
                            extraContext,
                        }),
                    ),
                ]
                : [],
            rdfFieldProperties: Object.fromEntries(
                Object.entries(config.fields).map(([field, definition]) => [
                    field,
                    new RDFNamedNode(
                        expandIRI(definition.rdfProperty() ?? field, {
                            defaultPrefix,
                            extraContext,
                        }),
                    ),
                ]),
            ),
        };
    
    } as unknown as SchemaModelClass<TFields, TRelations>;
}
