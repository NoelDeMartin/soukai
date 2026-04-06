import { arrayFrom } from '@noeldemartin/utils';
import { ZodArray } from 'zod';

import { getFinalType } from 'soukai-bis/zod/utils';
import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import type Relation from './Relation';
import type { GetRelatedModelInput } from './types';

export default class HasRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
    ForeignKeyName extends keyof GetModelInput<RelatedClass> = keyof GetModelInput<RelatedClass>,
> {

    public addForeignAttributes<T extends GetRelatedModelInput<RelatedClass, ForeignKeyName>>(
        this: Relation<Parent, Related, RelatedClass, ForeignKeyName>,
        attributes: T,
    ): T {
        const foreignKey = this.parent.getAttribute(this.localKeyName);

        if (!foreignKey) {
            return attributes;
        }

        const foreignKeyName = this.requireForeignKeyName() as ForeignKeyName;
        const fieldDefinition = this.relatedClass.schema.fields.def.shape[String(foreignKeyName)];
        const fieldType = fieldDefinition && getFinalType(fieldDefinition);
        const foreignValue = (
            fieldType instanceof ZodArray ? arrayFrom(attributes[foreignKeyName], true) : attributes[foreignKeyName]
        ) as T[ForeignKeyName];

        if (!Array.isArray(foreignValue)) {
            attributes[foreignKeyName] = foreignKey as T[ForeignKeyName];
        } else if (!foreignValue.includes(foreignKey)) {
            attributes[foreignKeyName] = foreignValue.concat([foreignKey]) as T[ForeignKeyName];
        }

        return attributes;
    }

    public setForeignAttributes(this: Relation<Parent, Related, RelatedClass, ForeignKeyName>, related: Related): void {
        const foreignKeyName = this.requireForeignKeyName();
        const attributes = related.getAttributes();

        this.addForeignAttributes(attributes as GetRelatedModelInput<RelatedClass, ForeignKeyName>);

        related.setAttribute(foreignKeyName, attributes[foreignKeyName]);
    }

}
