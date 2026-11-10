import type { ModelWithUrl } from 'soukai-bis/models/types';

export function uniqueModels<T extends ModelWithUrl>(models: T[]): T[] {
    return Array.from(new Map(models.map((model) => [model.url, model])).values());
}
