import type { ClosureArgs } from '@noeldemartin/utils';
import { arrayRemove, memo, tap } from '@noeldemartin/utils';

import type { Model } from './Model';
import type { ModelConstructor, SchemaDefinition } from './inference';
import type { Relation } from './relations/Relation';

const EMPTY_OBJECT = {};
const UNKNOWN_OBJECT = {};
const eventTargets: WeakMap<String, WeakMap<object, WeakSet<Model | typeof Model>>> = new WeakMap();
let listeners: WeakMap<typeof Model, Record<string, ModelListener[]>> = new WeakMap();

function makeKey(value: unknown): object {
    if (value === null || value === undefined) {
        return EMPTY_OBJECT;
    }

    switch (typeof value) {
        case 'string':
            return memo(`listeners-string-key-${value}`, () => new String(value));
        case 'number':
            return memo(`listeners-number-key-${value}`, () => new Number(value));
        case 'boolean':
            return memo(`listeners-boolean-key-${value}`, () => new Boolean(value));
        case 'object':
            return value;
        default:
            return UNKNOWN_OBJECT;
    }
}

export type ModelListener<
    TModel extends Model = Model,
    TEvent extends keyof ModelEvents | keyof ModelClassEvents = keyof ModelEvents | keyof ModelClassEvents,
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

export type ModelEmitArgs<T extends keyof ModelEvents | keyof ModelClassEvents> = T extends keyof ModelEvents
    ? ModelEvents[T] extends void
        ? [event: T]
        : [event: T, payload: ModelEvents[T]]
    : T extends keyof ModelClassEvents
      ? ModelClassEvents[T] extends void
          ? [event: T]
          : [event: T, payload: ModelClassEvents[T]]
      : never;

export type ModelListenerArgs<
    TModel extends Model,
    TEvent extends keyof ModelEvents | keyof ModelClassEvents,
> = TEvent extends keyof ModelEvents
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
    const eventListeners = (modelListeners[event] ??= []);

    eventListeners.push(listener);

    return () => arrayRemove(eventListeners, listener);
}

/* eslint-disable max-len */
export async function emitModelEvent<T extends keyof ModelClassEvents>(
    modelClass: ModelConstructor,
    ...args: ModelEmitArgs<T>
): Promise<void>;
export async function emitModelEvent<T extends keyof ModelEvents>(
    model: Model,
    ...args: ModelEmitArgs<T>
): Promise<void>;
/* eslint-enable max-len */

export async function emitModelEvent(...args: ClosureArgs): Promise<void> {
    const modelClass = '__attributeGetters' in args[0] ? args[0] : args[0].static();
    const model = '__attributeGetters' in args[0] ? null : args[0];
    const event = args[1];
    const payload = args[2];
    const target = model ?? modelClass;
    const modelListeners = listeners.get(modelClass)?.[event];
    const eventKey = makeKey(event) as String;
    const payloadKey = makeKey(payload);
    const events = eventTargets.has(eventKey)
        ? (eventTargets.get(eventKey) as WeakMap<object, WeakSet<Model | typeof Model>>)
        : tap(new WeakMap(), (map) => eventTargets.set(eventKey, map));
    const payloads = events.has(payloadKey)
        ? (events.get(payloadKey) as WeakSet<Model | typeof Model>)
        : tap(new WeakSet(), (set) => events.set(payloadKey, set));

    if (!modelListeners || payloads.has(target)) {
        return;
    }

    payloads.add(target);

    await Promise.all(modelListeners.map((listener) => (model ? listener(model, payload) : listener(payload))));

    payloads.delete(target);
}
