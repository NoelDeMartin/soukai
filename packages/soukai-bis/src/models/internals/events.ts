import { arrayRemove } from '@noeldemartin/utils';
import type { ModelClassEvent, ModelInstanceEvent, ModelListener } from 'soukai-bis/models/events';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

export const listeners = {
    classes: new WeakMap<ModelConstructor, ListenersRegistry>(),
    instances: new WeakMap<Model, ListenersRegistry>(),
};

type ListenersRegistry = Record<string, Registration[]>;

interface Registration {
    once: boolean;
    listener: (payload: never) => unknown;
}

function getRegistry(owner: Model | ModelConstructor): ListenersRegistry | undefined {
    return typeof owner === 'function' ? listeners.classes.get(owner) : listeners.instances.get(owner);
}

function requireRegistry(owner: Model | ModelConstructor): ListenersRegistry {
    const registry = getRegistry(owner) ?? {};

    typeof owner === 'function' ? listeners.classes.set(owner, registry) : listeners.instances.set(owner, registry);

    return registry;
}

function removeRegistrations(registrations: Registration[], filter: (registration: Registration) => boolean): void {
    for (let index = registrations.length - 1; index >= 0; index--) {
        const registration = registrations[index];

        if (!registration || !filter(registration)) {
            continue;
        }

        registrations.splice(index, 1);
    }
}

function pullListeners(registrations: Registration[] = []): Registration['listener'][] {
    const listeners = registrations.map((registration) => registration.listener);

    removeRegistrations(registrations, (registration) => registration.once);

    return listeners;
}

export async function emitToListeners(
    modelClass: ModelConstructor,
    event: string,
    payload: object,
    options: { instance?: Model } = {},
): Promise<void> {
    const eventListeners = [
        ...pullListeners(listeners.classes.get(modelClass)?.[event]),
        ...pullListeners(options.instance && listeners.instances.get(options.instance)?.[event]),
    ] as ((payload: object) => unknown)[];

    await Promise.all(eventListeners.map((listener) => listener(payload)));
}

export function onModelEvent<TModel extends Model, TEvent extends ModelInstanceEvent | ModelClassEvent>(
    owner: Model | ModelConstructor<TModel>,
    event: TEvent,
    listener: ModelListener<TModel, TEvent>,
    options: { once?: boolean } = {},
): () => void {
    const registrations = (requireRegistry(owner)[event] ??= []);
    const registration: Registration = { listener, once: !!options.once };

    registrations.push(registration);

    return () => arrayRemove(registrations, registration);
}

export function offModelEvent(
    owner: Model | ModelConstructor,
    event: ModelInstanceEvent | ModelClassEvent | '*',
    listener: (payload: never) => unknown,
): void {
    const registry = getRegistry(owner) ?? {};
    const eventsRegistrations = event === '*' ? Object.values(registry) : [registry[event] ?? []];

    for (const registrations of eventsRegistrations) {
        removeRegistrations(registrations, (registration) => registration.listener === listener);
    }
}
