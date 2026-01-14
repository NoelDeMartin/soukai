import { object, url } from 'zod';
import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { NamedNode } from '@rdfjs/types';
import type { Override } from '@noeldemartin/utils';
import type { ZodObject, ZodType, z } from 'zod';

import type { MintedModel, ModelInstanceType } from 'soukai-bis/models/types';

import Model from './Model';

export type Schema<T extends SchemaFields = SchemaFields> = {
    fields: ZodObject<T>;
    rdfContext: { default: string } & Record<string, string>;
    rdfClasses: NamedNode[];
    rdfDefaultResourceHash: string;
    rdfFieldProperties: Record<keyof T, NamedNode>;
};

export type SchemaModelInput<T extends SchemaFields = SchemaFields> = z.input<ZodObject<T>> & { url?: string };
export type SchemaModelAttributes<T extends SchemaFields = SchemaFields> = z.infer<ZodObject<T>> & { url?: string };

export type SchemaModel<T extends SchemaFields = SchemaFields> = Model<SchemaModelAttributes<T>> &
    z.infer<ZodObject<T>>;

export type SchemaModelClass<T extends SchemaFields = SchemaFields> = Override<
    typeof Model,
    {
        new (attributes?: SchemaModelInput<T>, exists?: boolean): SchemaModel<T>;
        newInstance<This>(this: This, attributes?: SchemaModelInput<T>, exists?: boolean): ModelInstanceType<This>;
        create<This>(this: This, attributes?: SchemaModelInput<T>): Promise<MintedModel<ModelInstanceType<This>>>;
        createFromJsonLD<This>(
            this: This,
            json: JsonLD,
            options?: { url?: string }
        ): Promise<MintedModel<ModelInstanceType<This>> | null>;
    }
>;

export type SchemaFields = Record<string, ZodType>;

export interface SchemaConfig<T extends SchemaFields> {
    crdts?: boolean;
    rdfContext?: string;
    rdfClass?: string;
    rdfDefaultResourceHash?: string;
    fields: T;
    relations?: Record<string, unknown>;
}

export function defineSchema<T extends SchemaFields>(config: SchemaConfig<T>): SchemaModelClass<T> {
    const rdfContext = config.rdfContext ? { default: config.rdfContext } : { default: 'solid' };
    const { default: defaultPrefix, ...extraContext } = rdfContext;

    return class extends Model<SchemaModelAttributes<T>> {

        public static schema = {
            fields: object(config.fields).extend({ url: url().optional() }) as unknown as ZodObject,
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
    
    } as unknown as SchemaModelClass<T>;
}
