import SoukaiError from 'soukai-bis/errors/SoukaiError';

import { isBooted } from './concerns/boot';
import { remoteModels } from './internals/model';
import type Model from './Model';
import { bootModels } from './registry';
import type { ModelConstructor } from './types';

export function remote<T extends ModelConstructor>(model: T): T {
    if (model.remote) {
        return model;
    }

    const cachedModel = remoteModels.get(model);

    if (cachedModel) {
        return cachedModel as T;
    }

    if (!isBooted(model)) {
        throw new SoukaiError(`Can't create remote ${model.name} model before booting it`);
    }

    const RemoteModel = class extends (model as unknown as typeof Model) {
        public static override remote = true;
    };

    bootModels({ [`Remote${model.modelName}`]: RemoteModel });

    RemoteModel.defaultContainerUrl = model.defaultContainerUrl;

    remoteModels.set(model, RemoteModel);

    return RemoteModel as unknown as T;
}
