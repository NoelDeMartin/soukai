import { arrayRemove } from '@noeldemartin/utils';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

const listeners: WeakMap<ModelConstructor, Record<string, ModelListener[]>> = new WeakMap();

export type ModelEvent = 'created' | 'updated' | 'deleted' | 'saved';
export type ModelListener<TModel extends Model = Model> = (model: TModel) => unknown;

export async function emitModelEvent(model: Model, event: ModelEvent): Promise<void> {
    const modelListeners = listeners.get(model.static())?.[event] ?? [];

    await Promise.all(modelListeners.map((listener) => listener(model)));
}

export function onModelEvent<T extends Model>(
    model: ModelConstructor<T>,
    event: ModelEvent,
    listener: ModelListener<T>,
): () => void {
    if (!listeners.has(model)) {
        listeners.set(model, {});
    }

    const modelListeners = listeners.get(model) as Record<string, ModelListener[]>;
    const eventListeners = (modelListeners[event] ??= []);

    eventListeners.push(listener as ModelListener);

    return () => arrayRemove(eventListeners, listener as ModelListener);
}
