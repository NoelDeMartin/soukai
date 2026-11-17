import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Model from 'soukai-bis/models/Model';
import type { ModelsRegistry } from 'soukai-bis/models/registry';
import type { ModelConstructor, ModelInstanceType } from 'soukai-bis/models/types';

import type { RelationKind, RelationsRegistry } from './fluent';
import type { AnyMultiModelRelation, RelationConstructor } from './types';

declare const RELATION_KIND_MARKER: unique symbol;

export type RelatedModelName = keyof ModelsRegistry;
export type OnDeleteAction = 'cascade';

export type SchemaRelations = Record<string, SchemaRelationDefinition>;
export type SchemaModelRelations<T extends SchemaRelations = SchemaRelations, TParent extends Model = Model> = {
    [K in keyof T]?: InstanceType<T[K]['relationClass']> extends AnyMultiModelRelation
        ? GetRelatedModel<T[K]>[]
        : GetRelatedModel<T[K]>;
} & {
    readonly [K in keyof T as `related${Capitalize<string & K>}`]: GetRelationInstance<T[K], TParent>;
};

export type GetRelationInstance<
    T extends SchemaRelationDefinition,
    TParent extends Model = Model,
> = null extends T[typeof RELATION_KIND_MARKER]
    ? InstanceType<T['relationClass']>
    : RelationsRegistry<TParent, GetRelatedModel<T>, GetRelatedClass<T>>[NonNullable<T[typeof RELATION_KIND_MARKER]>];

export type GetLoadedRelationModels<T> = T extends SchemaRelationDefinition
    ? InstanceType<T['relationClass']> extends AnyMultiModelRelation
        ? GetRelatedModel<T>[]
        : GetRelatedModel<T> | null
    : Model | Model[] | null;

export type GetRelatedModel<T extends SchemaRelationDefinition> = ModelInstanceType<
    ModelsRegistry[T['relatedModelName']]
>;

export type GetRelatedClass<T extends SchemaRelationDefinition> =
    ModelsRegistry[T['relatedModelName']] extends ModelConstructor<GetRelatedModel<T>>
        ? ModelsRegistry[T['relatedModelName']]
        : ModelConstructor<GetRelatedModel<T>>;

export class SchemaRelationDefinition<
    TRelatedName extends RelatedModelName = RelatedModelName,
    TRelationClass extends RelationConstructor = RelationConstructor,
    TKind extends RelationKind | null = RelationKind | null,
> {
    declare public readonly [RELATION_KIND_MARKER]?: TKind;

    constructor(
        public relatedModelName: TRelatedName,
        public relationClass: TRelationClass,
        public options: {
            foreignKey?: string;
            localKey?: string;
            usingSameDocument?: boolean;
            autoload?: boolean;
            from?: string;
            onDelete?: OnDeleteAction | null;
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

    public onDelete(action: OnDeleteAction | null): this {
        this.options.onDelete = action;

        return this;
    }
}

export class SchemaContainerRelationDefinition<
    TRelatedName extends RelatedModelName = RelatedModelName,
    TRelationClass extends RelationConstructor = RelationConstructor,
    TKind extends RelationKind | null = RelationKind | null,
> extends SchemaRelationDefinition<TRelatedName, TRelationClass, TKind> {
    public onDelete(action: OnDeleteAction | null): this {
        if (action !== null) {
            throw new SoukaiError(
                `Container relations don't support onDelete('${action}'), containers can only be deleted when they're empty.`,
            );
        }

        return super.onDelete(action);
    }
}

export class SchemaHasRelationDefinition<
    TRelatedName extends RelatedModelName = RelatedModelName,
    TRelationClass extends RelationConstructor = RelationConstructor,
    TKind extends RelationKind | null = RelationKind | null,
> extends SchemaRelationDefinition<TRelatedName, TRelationClass, TKind> {
    public from(containerUrlProperty: string): this {
        this.options.from = containerUrlProperty;

        return this;
    }
}
