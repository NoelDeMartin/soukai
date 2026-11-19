import type Model from 'soukai-bis/models/Model';
import type Relation from 'soukai-bis/models/relations/Relation';
import type { ModelConstructor } from 'soukai-bis/models/types';

import { emitToListeners, listeners } from './internals/events';
import { canonicalModel } from './internals/model';

export interface ModelInstanceEvents {
    created: NoPayload;
    updated: NoPayload;
    deleted: NoPayload;
    saved: NoPayload;
    modified: { field: string };
    'relation-loaded': { relation: Relation };
    'file-uploaded': { url: string; blob: Blob };
    'file-deleted': { url: string };
}

export interface ModelClassEvents {
    'schema-updated': { schema: ModelConstructor };
}

export type ModelInstanceEvent = keyof ModelInstanceEvents;
export type ModelClassEvent = keyof ModelClassEvents;
export type NoPayload = Record<never, never>;
export type PayloadArgs<T> = keyof T extends never ? [] : [payload: T];

export type ModelInstanceEventPayload<
    TModel extends Model = Model,
    TEvent extends ModelInstanceEvent = ModelInstanceEvent,
> = {
    model: TModel;
} & ModelInstanceEvents[TEvent];

export type ModelClassEventPayload<TModel extends Model = Model, TEvent extends ModelClassEvent = ModelClassEvent> = {
    modelClass: ModelConstructor<TModel>;
} & ModelClassEvents[TEvent];

export type ModelListener<
    TModel extends Model = Model,
    TEvent extends ModelInstanceEvent | ModelClassEvent = ModelInstanceEvent,
> = (
    payload: TEvent extends ModelInstanceEvent
        ? ModelInstanceEventPayload<TModel, TEvent>
        : TEvent extends ModelClassEvent
          ? ModelClassEventPayload<TModel, TEvent>
          : never,
) => unknown;

export type ModelInstanceListener<
    TModel extends Model = Model,
    TEvent extends ModelInstanceEvent = ModelInstanceEvent,
> = (payload: ModelInstanceEventPayload<TModel, TEvent>) => unknown;

export async function emitModelInstanceEvent<TEvent extends ModelInstanceEvent>(
    model: Model,
    event: TEvent,
    ...[payload]: PayloadArgs<ModelInstanceEvents[TEvent]>
): Promise<void> {
    await emitToListeners(model.static(), event, { ...payload, model }, { instance: canonicalModel(model) });
}

export async function emitModelClassEvent<TEvent extends ModelClassEvent>(
    modelClass: ModelConstructor,
    event: TEvent,
    ...[payload]: PayloadArgs<ModelClassEvents[TEvent]>
): Promise<void> {
    await emitToListeners(modelClass, event, { ...payload, modelClass });
}

export function resetModelListeners(): void {
    listeners.classes = new WeakMap();
    listeners.instances = new WeakMap();
}
