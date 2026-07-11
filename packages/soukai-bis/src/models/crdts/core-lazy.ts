import { requireBootedModel } from 'soukai-bis/models/registry';
import type { ModelConstructor } from 'soukai-bis/models/types';

export function getCoreOperationModels(): ModelConstructor[] {
    return [requireBootedModel('SetPropertyOperation'), requireBootedModel('UnsetPropertyOperation')];
}
