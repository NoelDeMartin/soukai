import { arrayFrom } from '@noeldemartin/utils';
import { ZodArray } from 'zod';

import { getFinalType } from 'soukai-bis/zod/utils';
import type Model from 'soukai-bis/models/Model';
import type Relation from 'soukai-bis/models/relations/Relation';
import type { ModelConstructor } from 'soukai-bis/models/types';

export default class HasRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> {

    public setForeignAttributes(this: Relation<Parent, Related, RelatedClass>, related: Related): void {
        const foreignKey = this.parent.getAttribute(this.localKeyName);

        if (!foreignKey) {
            return;
        }

        const foreignKeyName = this.requireForeignKeyName();
        const fieldDefinition = related.static().schema.fields.def.shape[foreignKeyName];
        const fieldType = fieldDefinition && getFinalType(fieldDefinition);
        const foreignValue =
            fieldType instanceof ZodArray
                ? arrayFrom(related.getAttribute(foreignKeyName), true)
                : related.getAttribute(foreignKeyName);

        if (!Array.isArray(foreignValue)) {
            related.setAttribute(foreignKeyName, foreignKey);

            return;
        }

        if (foreignValue.includes(foreignKey)) {
            return;
        }

        related.setAttribute(foreignKeyName, foreignValue.concat([foreignKey]));
    }

}
