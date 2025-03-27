import { arrayFrom, arrayWithout, tap } from '@noeldemartin/utils';
import { SoukaiError } from 'soukai';
import type { ModelCastAttributeOptions } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import Model from './RemovePropertyOperation.schema';

type AttributeCaster = <T>(field: string, value: T) => T;

export default class RemovePropertyOperation extends Model {

    private static attributeCasters: WeakMap<typeof SolidModel, AttributeCaster> = new WeakMap();

    protected applyPropertyUpdate(model: SolidModel, field: string): void {
        const value = model.getAttributeValue(field);

        if (!Array.isArray(value)) {
            throw new SoukaiError('Can\'t apply Remove operation to non-array field (use Unset instead)');
        }

        model.setAttributeValue(
            field,
            arrayWithout(value, this.castModelAttribute(model, field, arrayFrom(this.value))),
        );
    }

    private castModelAttribute<T = unknown>(model: SolidModel, field: string, value: T): T {
        const ModelClass = model.constructor as SolidModelConstructor;
        const caster =
            RemovePropertyOperation.attributeCasters.get(ModelClass) ?? this.createAttributeCaster(ModelClass);

        return caster(field, value);
    }

    private createAttributeCaster(ModelClass: SolidModelConstructor): AttributeCaster {
        const CasterClass = class extends ModelClass {

            public castAttribute<T>(value: T, options: ModelCastAttributeOptions = {}): T {
                return super.castAttribute(value, options) as T;
            }
        
        };
        const casterInstance = CasterClass.pureInstance();

        return tap(
            <T>(field: string, value: T) =>
                casterInstance.castAttribute(value, {
                    definition: casterInstance.static().getFieldDefinition(field),
                }),
            (caster) => RemovePropertyOperation.attributeCasters.set(ModelClass, caster),
        );
    }

}
