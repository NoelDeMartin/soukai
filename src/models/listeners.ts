import type { ClosureArgs } from '@noeldemartin/utils';
import { arrayRemove } from '@noeldemartin/utils';

import { Model } from './Model';
import type { ModelConstructor, SchemaDefinition } from './inference';
import type { Relation } from './relations/Relation';

let listeners: WeakMap<typeof Model, Record<string, ModelListener[]>> = new WeakMap;

export type ModelListener<
    TModel extends Model = Model,
    TEvent extends keyof ModelEvents | keyof ModelClassEvents = keyof ModelEvents | keyof ModelClassEvents
> = (...args: ModelListenerArgs<TModel, TEvent>) => unknown;

export interface ModelClassEvents {
    'schema-updated': SchemaDefinition;
}

export interface ModelEvents {
    created: void;
    deleted: void;
    updated: void;
    modified: string;
    'relation-loaded': Relation;
}

export type ModelEmitArgs<T extends keyof ModelEvents | keyof ModelClassEvents> =
    T extends keyof ModelEvents
        ? ModelEvents[T] extends void
            ? [event: T]
            : [event: T, payload: ModelEvents[T]]
        : T extends keyof ModelClassEvents
            ? ModelClassEvents[T] extends void
                ? [event: T]
                : [event: T, payload: ModelClassEvents[T]]
            : never;

export type ModelListenerArgs<TModel extends Model, TEvent extends keyof ModelEvents | keyof ModelClassEvents> =
    TEvent extends keyof ModelEvents
        ? ModelEvents[TEvent] extends void
                ? [model: TModel]
                : [model: TModel, payload: ModelEvents[TEvent]]
        : TEvent extends keyof ModelClassEvents
            ? ModelClassEvents[TEvent] extends void
                ? []
                : [payload: ModelClassEvents[TEvent]]
            : never;

export function resetModelListeners(): void {
    listeners = new WeakMap();
}

export function registerModelListener<TModel extends Model, TEvent extends keyof ModelEvents | keyof ModelClassEvents>(
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

/* eslint-disable max-len */
export async function emitModelEvent<T extends keyof ModelClassEvents>(modelClass: ModelConstructor, ...args: ModelEmitArgs<T>): Promise<void>;
export async function emitModelEvent<T extends keyof ModelEvents>(model: Model, ...args: ModelEmitArgs<T>): Promise<void>;
/* eslint-enable max-len */

export async function emitModelEvent(...args: ClosureArgs): Promise<void> {
    const modelClass = args[0] instanceof Model ? args[0].static() : args[0];
    const model = args[0] instanceof Model ? args[0] : null;
    const event = args[1];
    const payload = args[2];
    const modelListeners = listeners.get(modelClass)?.[event];

    if (!modelListeners) {
        return;
    }

    await Promise.all(modelListeners.map(listener => model ? listener(model, payload) : listener(payload)));
}
