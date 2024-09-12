import { arrayRemove } from '@noeldemartin/utils';

import type { Model } from './Model';
import type { ModelConstructor } from './inference';
import type { Relation } from './relations/Relation';

let listeners: WeakMap<typeof Model, Record<string, ModelListener[]>> = new WeakMap;

export type ModelListener<
    TModel extends Model = Model,
    TEvent extends keyof ModelEvents = keyof ModelEvents
> = (...args: ModelListenerArgs<TModel, TEvent>) => unknown;

export interface ModelEvents {
    created: void;
    deleted: void;
    updated: void;
    modified: string;
    'relation-loaded': Relation;
}

export type ModelEmitArgs<T extends keyof ModelEvents> =
    ModelEvents[T] extends void
        ? [event: T]
        : [event: T, payload: ModelEvents[T]];

export type ModelListenerArgs<TModel extends Model, TEvent extends keyof ModelEvents> =
    ModelEvents[TEvent] extends void
        ? [model: TModel]
        : [model: TModel, payload: ModelEvents[TEvent]];

export function resetModelListeners(): void {
    listeners = new WeakMap();
}

export function registerModelListener<TModel extends Model, TEvent extends keyof ModelEvents>(
    modelClass: ModelConstructor<TModel>,
    event: TEvent,
    listener: ModelListener<TModel, TEvent>,
): () => void {
    if (!listeners.has(modelClass)) {
        listeners.set(modelClass, {});
    }

    const modelListeners = listeners.get(modelClass) as Record<string, ModelListener<TModel, TEvent>[]>;
    const eventListeners = modelListeners[event] ??= [];

    eventListeners.push(listener);

    return () => arrayRemove(eventListeners, listener);
}

export async function emitModelEvent<T extends keyof ModelEvents>(
    model: Model,
    ...args: ModelEmitArgs<T>
): Promise<void> {
    const event = args[0];
    const payload = args[1];
    const modelListeners = listeners.get(model.static())?.[event];

    if (!modelListeners) {
        return;
    }

    await Promise.all(modelListeners.map(listener => listener(model, payload)));
}
