import { arrayRemove } from '@noeldemartin/utils';

import type Model from 'soukai-bis/models/Model';
import type Relation from 'soukai-bis/models/relations/Relation';
import type { ModelConstructor } from 'soukai-bis/models/types';

let listeners: WeakMap<ModelConstructor, Record<string, ModelListener[]>> = new WeakMap();

export interface ModelEvents {
    created: void;
    updated: void;
    deleted: void;
    saved: void;
    modified: string;
    'relation-loaded': Relation;
}

export type ModelEvent = keyof ModelEvents;

export type ModelListener<
    TModel extends Model = Model,
    TEvent extends ModelEvent = ModelEvent,
> = ModelEvents[TEvent] extends void
    ? (model: TModel) => unknown
    : (model: TModel, payload: ModelEvents[TEvent]) => unknown;

export async function emitModelEvent<TEvent extends ModelEvent>(
    model: Model,
    event: TEvent,
    ...payload: ModelEvents[TEvent] extends void ? [] : [ModelEvents[TEvent]]
): Promise<void> {
    const modelListeners = listeners.get(model.static())?.[event] ?? [];

    await Promise.all(modelListeners.map((listener) => listener(model, payload[0])));
}

export function onModelEvent<TModel extends Model, TEvent extends ModelEvent>(
    model: ModelConstructor<TModel>,
    event: TEvent,
    listener: ModelListener<TModel, TEvent>,
): () => void {
    if (!listeners.has(model)) {
        listeners.set(model, {});
    }

    const modelListeners = listeners.get(model) as Record<string, ModelListener<TModel, TEvent>[]>;
    const eventListeners = (modelListeners[event] ??= []);

    eventListeners.push(listener as ModelListener<TModel, TEvent>);

    return () => arrayRemove(eventListeners, listener as ModelListener<TModel, TEvent>);
}

export function resetModelListeners(): void {
    listeners = new WeakMap();
}
