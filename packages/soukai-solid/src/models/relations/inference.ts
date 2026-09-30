import type { Relation } from 'soukai';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export type SolidRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = Relation<Parent, Related, RelatedClass>;
