import { getWeakMemo, resetWeakMemo } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Model } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';

export function bustWeakMemoModelCache(model: Nullable<Model>): void {
    const relatedModels = model && getWeakMemo<SolidModel[]>('related-models', model);
    const documentModels = model && getWeakMemo<SolidModel[]>('document-models', model);
    const cascadeModels = model && getWeakMemo<Model[]>('cascade-models', model);

    relatedModels?.forEach((relatedModel) => resetWeakMemo('related-models', relatedModel));
    documentModels?.forEach((documentModel) => resetWeakMemo('document-models', documentModel));
    cascadeModels?.forEach((cascadeModel) => resetWeakMemo('cascade-models', cascadeModel));
}
