import type { Constructor, Pretty } from '@noeldemartin/utils';
import type { GetArrayFields, GetFieldsDefinition, MagicAttributeProperties, MagicAttributes, Relation } from 'soukai';

import type SolidContainer from './SolidContainer';
import type { SolidFieldsDefinition, SolidSchemaDefinition } from './fields';
import type { SolidModel } from './SolidModel';

export type SolidMagicAttributes<
    S extends SolidSchemaDefinition,
    F extends SolidFieldsDefinition = GetFieldsDefinition<S>,
> = Pretty<MagicAttributes<S, string, 'url'> & MagicAttributeProperties<Pick<F, GetArrayFields<F>>, string>>;

export type SolidModelConstructor<T extends SolidModel = SolidModel> = Constructor<T> & typeof SolidModel;
export type SolidContainerConstructor<T extends SolidContainer = SolidContainer> = Constructor<T> &
    typeof SolidContainer;

export type PropertiesOnly<T> = { [P in keyof T as Exclude<P, T[P] extends (Function | Relation) ? P : never>]: T[P] };
export type ReadOnlyFlatArray<T> = { [P in keyof T]: readonly (T[P] extends unknown[] ? T[P][number] : T[P])[]};
export type MultiDocumentDelegate<T> = 
    Readonly<ReadOnlyFlatArray<Required<PropertiesOnly<Omit<T, keyof SolidModel>>>>>;
