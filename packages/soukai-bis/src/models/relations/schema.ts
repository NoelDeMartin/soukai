import type { ComputedAttributeCompute, InvalidationStrategy } from 'soukai-bis/models/computed-attributes';
import type { ContainerConstructor, ModelConstructor, ModelInstanceType } from 'soukai-bis/models/types';

import type { AnyMultiModelRelation, RelationConstructor } from './types';

// oxlint-disable-next-line typescript/no-explicit-any
export type RelatedModelDefinition<TRelated extends ModelConstructor = ModelConstructor> = TRelated | (() => any);
export type RelatedContainerDefinition<TRelated extends ContainerConstructor = ContainerConstructor> =
    | TRelated
    | (() => any); // oxlint-disable-line typescript/no-explicit-any

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
            autoload?: boolean;
        } = {},
    ) {}

    public usingSameDocument(): this {
        this.options.usingSameDocument = true;

        return this;
    }

    public autoload(autoload: boolean = true): this {
        this.options.autoload = autoload;

        return this;
    }
}

export type SchemaComputedAttributeDefinition = {
    invalidationStrategy: InvalidationStrategy;
    // oxlint-disable-next-line typescript/no-explicit-any
    compute: ComputedAttributeCompute<any, unknown>;
};
