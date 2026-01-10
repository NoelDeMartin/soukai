import { object } from 'zod';
import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import type { Constructor } from '@noeldemartin/utils';
import type { ZodObject, ZodType, z } from 'zod';
import type { NamedNode } from '@rdfjs/types';

import Model from './Model';

export type Schema<T extends SchemaFields = SchemaFields> = {
    fields: ZodObject<T>;
    rdfContext: { default: string } & Record<string, string>;
    rdfClasses: NamedNode[];
    rdfDefaultResourceHash: string;
    rdfFieldProperties: Record<string, NamedNode>;
};
export type SchemaModel<T extends SchemaFields> = typeof Model & Constructor<z.infer<ZodObject<T>>>;
export type SchemaFields = Record<string, ZodType>;

export interface SchemaConfig<T extends SchemaFields> {
    crdts?: boolean;
    rdfContext?: string;
    rdfClass?: string;
    rdfDefaultResourceHash?: string;
    fields: T;
    relations?: Record<string, unknown>;
}

export function defineSchema<T extends SchemaFields>(config: SchemaConfig<T>): SchemaModel<T> {
    const rdfContext = config.rdfContext ? { default: config.rdfContext } : { default: 'solid' };
    const { default: defaultPrefix, ...extraContext } = rdfContext;

    return class extends Model {

        public static schema = {
            fields: object(config.fields) as unknown as ZodObject,
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
    
    } as SchemaModel<T>;
}
