import type { ContainerConstructor, ModelConstructor, ModelInstanceType } from 'soukai-bis/models/types';

import type { AnyMultiModelRelation, RelationConstructor } from './types';

export class SchemaRelationDefinition<
    TRelated extends RelatedModelDefinition = RelatedModelDefinition,
    TRelationClass extends RelationConstructor = RelationConstructor,
> {

    constructor(
        public relatedClass: TRelated,
        public relationClass: TRelationClass,
        public options: {
            foreignKey?: string;
            localKey?: string;
            usingSameDocument?: boolean;
        } = {},
    ) {}

    public usingSameDocument(): this {
        this.options.usingSameDocument = true;

        return this;
    }

}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RelatedModelDefinition<TRelated extends ModelConstructor = ModelConstructor> = TRelated | (() => any);
export type RelatedContainerDefinition<TRelated extends ContainerConstructor = ContainerConstructor> =
    | TRelated
    | (() => any); // eslint-disable-line @typescript-eslint/no-explicit-any

export type SchemaRelations = Record<string, SchemaRelationDefinition>;
export type SchemaModelRelations<T extends SchemaRelations = SchemaRelations> = {
    [K in keyof T]?: InstanceType<T[K]['relationClass']> extends AnyMultiModelRelation
        ? GetRelatedModel<T[K]>[]
        : GetRelatedModel<T[K]>;
} & {
    [K in keyof T as `related${Capitalize<string & K>}`]: InstanceType<T[K]['relationClass']>;
};

export type GetRelatedModel<T extends SchemaRelationDefinition> = T['relatedClass'] extends () => infer TRelated
    ? ModelInstanceType<TRelated>
    : ModelInstanceType<T['relatedClass']>;
