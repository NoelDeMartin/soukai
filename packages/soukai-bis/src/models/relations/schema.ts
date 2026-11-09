import type { ComputedAttributeCompute, InvalidationStrategy } from 'soukai-bis/models/computed-attributes';
import type Model from 'soukai-bis/models/Model';
import type { ModelsRegistry } from 'soukai-bis/models/registry';
import type { ModelInstanceType } from 'soukai-bis/models/types';

import type { AnyMultiModelRelation, RelationConstructor } from './types';

export type RelatedModelName = keyof ModelsRegistry;

export type SchemaRelations = Record<string, SchemaRelationDefinition>;
export type SchemaModelRelations<T extends SchemaRelations = SchemaRelations> = {
    [K in keyof T]?: InstanceType<T[K]['relationClass']> extends AnyMultiModelRelation
        ? GetRelatedModel<T[K]>[]
        : GetRelatedModel<T[K]>;
} & {
    [K in keyof T as `related${Capitalize<string & K>}`]: InstanceType<T[K]['relationClass']>;
};

export type GetLoadedRelationModels<T> = T extends SchemaRelationDefinition
    ? InstanceType<T['relationClass']> extends AnyMultiModelRelation
        ? GetRelatedModel<T>[]
        : GetRelatedModel<T> | null
    : Model | Model[] | null;

export type GetRelatedModel<T extends SchemaRelationDefinition> = ModelInstanceType<
    ModelsRegistry[T['relatedModelName']]
>;

export class SchemaRelationDefinition<
    TRelatedName extends RelatedModelName = RelatedModelName,
    TRelationClass extends RelationConstructor = RelationConstructor,
> {
    constructor(
        public relatedModelName: TRelatedName,
        public relationClass: TRelationClass,
        public options: {
            foreignKey?: string;
            localKey?: string;
            usingSameDocument?: boolean;
            autoload?: boolean;
            from?: string;
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

export class SchemaHasRelationDefinition<
    TRelatedName extends RelatedModelName = RelatedModelName,
    TRelationClass extends RelationConstructor = RelationConstructor,
> extends SchemaRelationDefinition<TRelatedName, TRelationClass> {
    public from(containerUrlProperty: string): this {
        this.options.from = containerUrlProperty;

        return this;
    }
}

export type SchemaComputedAttributeDefinition = {
    invalidationStrategy: InvalidationStrategy;
    // oxlint-disable-next-line typescript/no-explicit-any
    compute: ComputedAttributeCompute<any, unknown>;
};
