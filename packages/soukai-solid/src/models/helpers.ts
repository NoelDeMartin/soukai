import SolidContainer from 'soukai-solid/models/SolidContainer';
import { LDP_CONTAINER } from 'soukai-solid/solid/constants';
import type { SolidContainerConstructor, SolidModelConstructor } from 'soukai-solid/models/inference';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export function isContainer(model: SolidModel): model is SolidContainer {
    return model instanceof SolidContainer;
}

export function isContainerClass(modelClass: SolidModelConstructor): modelClass is SolidContainerConstructor {
    return modelClass.rdfsClasses.includes(LDP_CONTAINER);
}
