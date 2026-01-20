import type { ModelConstructor, ModelInstanceType, SolidContainerConstructor } from 'soukai-bis/models/types';

import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import ContainsRelation from './ContainsRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import IsContainedByRelation from './IsContainedByRelation';
import type MultiModelRelation from './MultiModelRelation';
import type { RelationConstructor } from './types';

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
export type RelatedSolidContainerDefinition<TRelated extends SolidContainerConstructor = SolidContainerConstructor> =
    | TRelated
    | (() => any); // eslint-disable-line @typescript-eslint/no-explicit-any

export type SchemaRelations = Record<string, SchemaRelationDefinition>;
export type SchemaModelRelations<T extends SchemaRelations = SchemaRelations> = {
    [K in keyof T]?: InstanceType<T[K]['relationClass']> extends MultiModelRelation
        ? GetRelatedModel<T[K]>[]
        : GetRelatedModel<T[K]>;
} & {
    [K in keyof T as `related${Capitalize<string & K>}`]: InstanceType<T[K]['relationClass']>;
};

export type GetRelatedModel<T extends SchemaRelationDefinition> = T['relatedClass'] extends () => infer TRelated
    ? ModelInstanceType<TRelated>
    : ModelInstanceType<T['relatedClass']>;

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

export function belongsToMany<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, BelongsToManyRelation, { foreignKey });
}

export function belongsToOne<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, BelongsToOneRelation, { foreignKey });
}

export function contains<T extends RelatedModelDefinition>(relatedClass: T) {
    return new SchemaRelationDefinition(relatedClass, ContainsRelation);
}

export function hasMany<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, HasManyRelation, { foreignKey });
}

export function hasOne<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, HasOneRelation, {
        foreignKey,
    });
}

export function isContainedBy<T extends RelatedSolidContainerDefinition>(relatedClass: T) {
    return new SchemaRelationDefinition(relatedClass, IsContainedByRelation);
}
