import { type Constructor, arrayRemove, isInstanceOf, urlRoute } from '@noeldemartin/utils';
import { SoukaiError } from 'soukai';
import { ResourceNotFound } from 'soukai-solid/errors';

import { type SolidModel } from 'soukai-solid/models/SolidModel';

type SolidMultiDocumentModelListener<T extends SolidModel> = 
    (multiDocument: SolidMultiDocumentModel<T>, part: T | undefined) => unknown;

type SolidMultiDocumentConstructor<T extends SolidMultiDocumentModel<F>, F extends SolidModel> = 
    Constructor<T> & typeof SolidMultiDocumentModel<F>;

const SolidMultiDocumentModelEventTypes = {
    'part-created': ['created'],
    'part-modified': ['modified'],
    'part-updated': ['updated'],
    'part-deleted': ['deleted'],
    'part-relation-loaded': ['relation-loaded'],
    'part-added': [],
    'part-removed': [],
} as const;
type SolidMultiDocumentModelEventTypes = keyof typeof SolidMultiDocumentModelEventTypes;

export class SolidMultiDocumentModel<T extends SolidModel> {

    public static baseModel: typeof SolidModel;
    public static linkedByAttributes: string[];
    private _parts: T[] = [];
    private _proxy;
    private _id: string;
    private _eventHandlers: Record<string, SolidMultiDocumentModelListener<T>[]> = {};

    constructor(id: string) {
        this._id = id;

        if (!this.static().baseModel) {
            throw new SoukaiError('There is no base model class specified. Use multiDocumentModelOf function.');
        }

        this._proxy = new Proxy(this, {
            get(target, property, receiver) {
                if (property in target) {
                    return Reflect.get(target, property, receiver);
                }

                if (property in target.static().baseModel.fields) {
                    return target.mergeValuesFromParts(property.toString());
                }

                if (typeof property === 'string' && target.static().baseModel.relations.includes(property)) {
                    return target.mergeRelationValuesFromParts(property);
                }

                return undefined;
            },
        });
        return this._proxy;
    }

    /**
     * Creates an instance multi document model with the given key and attempts to load all linked parts
     * ({@link loadFromLinkedDocuments}).
     * @param key The identifier of the entity
     * @param firstDocumentUrl The first document to search in. If not specified, the key is used as a URL instead.
     * @returns New instance of multi document model
     */
    public static async find<F extends SolidModel, T extends SolidMultiDocumentModel<F>>(
        this: SolidMultiDocumentConstructor<T, F>,
        key: string,
        firstDocumentUrl?: string,
    ): Promise<T | null> {
        const result = new this(key);

        this.baseModel.ensureBooted();

        firstDocumentUrl ??= urlRoute(key);

        await result.loadFromLinkedDocuments(firstDocumentUrl);

        if (result._parts.length === 0) {
            return null;
        }

        return result;
    }

    /**
     * Recursively gather links of all parts and load them into the instance.
     * It does not load a document if there is already a part from that document.
     * If it is possible to load a document, but there is no suitable entity in it, a new part is created.
     * @param firstDocumentUrl The first document to search in.
     */
    public async loadFromLinkedDocuments(firstDocumentUrl?: string): Promise<void> {
        const foundDocumentUrls = new Set(this._parts.map(p => p.getSourceDocumentUrl()));
        
        let documentsUrlsForSearch = firstDocumentUrl ? [firstDocumentUrl] : this.getLinkedByValues(this._parts);
        while (documentsUrlsForSearch.length > 0) {
            const downloadPromises = [];
            for (const documentUrl of documentsUrlsForSearch) {
                if (foundDocumentUrls.has(documentUrl)) {
                    continue;
                }
                
                foundDocumentUrls.add(documentUrl);
                downloadPromises.push(
                    this.static().baseModel.findOrFail(this._id, documentUrl)
                        .catch(error => {
                            if (isInstanceOf(error, ResourceNotFound)) {
                                const instance = this.static().baseModel.newInstance({
                                    [this.static().baseModel.primaryKey]: this._id,
                                });
                                instance.setDocumentExists(true);
                                instance.setSourceDocumentUrl(documentUrl);
                                return instance;
                            }
                            return null;
                        }),
                );
            }

            const models = (await Promise.all(downloadPromises)).filter(m => m !== null);
            this._parts.push(...(models as T[]));
            
            documentsUrlsForSearch = this.getLinkedByValues(models);
        }
    }

    /**
     * Saves all parts that are dirty.
     */
    public async save(): Promise<void> {
        for (const part of this._parts) {
            await part.save();
        }
    }

    /**
     * Identifier of the entity.
     */
    public get id(): string {
        return this._id;
    }

    /**
     * Returns a snapshot of all loaded parts that contain data for this entity.
     * Modifications to the returned array have no effect.
     * Use {@link addPart} and {@link removePart} to make modifications.
     * @returns A snapshot of current parts of the entity
     */
    public getParts(): readonly T[] {
        return [...this._parts];
    }

    /**
     * Adds an entity to the multi document entity as its part.
     * The part has to have a source document url and no or correct primary key.
     * If the part does not have a primary key, it is set automatically.
     * @param part A part to be added
     */
    public async addPart(part: T): Promise<void> {
        if (part.getSourceDocumentUrl() === null) {
            throw new SoukaiError('All parts of multi document model must have their source document url set.');
        }

        if (part.getSerializedPrimaryKey() === null) {
            part.setAttribute(this.static().baseModel.primaryKey, this._id);
        }

        if (part.getSerializedPrimaryKey() !== this._id) {
            throw new SoukaiError('All parts of multi document model must have the same primary key.');
        }

        this._parts.push(part);

        await this.emitEvent('part-added', part);
    }

    /**
     * Removes the given part from the multi document entity.
     * @param part A part to be removed
     * @returns true if the part was included in the entity; otherwise, false
     */
    public async removePart(part: T): Promise<boolean> {
        const wasChanged = arrayRemove(this._parts, part);
        if (wasChanged) {
            await this.emitEvent('part-removed', part);
        }
        return wasChanged;
    }

    /**
     * Adds an event listener to this instance
     * @param event Type of event
     * @param listener Listener that is triggered by the event
     * @returns A function that unregisters the event
     */
    public on(
        event: SolidMultiDocumentModelEventTypes, 
        listener: SolidMultiDocumentModelListener<T>,
    ): () => void {
        const eventListeners = (this._eventHandlers[event] ??= []);
        
        eventListeners.push(listener);

        const baseListeners = SolidMultiDocumentModelEventTypes[event];
        const baseListenersDestroyers: (() => void)[] = [];

        for (const baseListener of baseListeners) {
            const listenerDestroyer = this.static().baseModel.on(baseListener, (...args) => {
                const part = args[0] as T;
                if (this._parts.includes(part)) {
                    this.emitEvent(event, part);
                }
            });
            baseListenersDestroyers.push(listenerDestroyer);
        }
    
        return () => {
            arrayRemove(eventListeners, listener);
            baseListenersDestroyers.forEach(destroyer => destroyer());
        };
    }

    /**
     * Emits an event for all listeners registered for the event type.
     * @param event Event type to be emitted
     * @param part Part that triggered the event
     */
    protected async emitEvent(event: SolidMultiDocumentModelEventTypes, part?: T): Promise<void> {
        const eventListeners = this._eventHandlers[event] ?? [];

        await Promise.all(eventListeners.map(listener => listener(this, part)));
    }

    protected static<BM extends SolidModel, M extends typeof SolidMultiDocumentModel<BM>>(): M {
        return this.constructor as M;
    }

    /**
     * Search all given instances for values of linked attributes and returns an array of all found values.
     * @param models Instances to be searched
     * @returns Non-unique list of found values
     */
    private getLinkedByValues(models: SolidModel[]): string[] {
        const foundValues = [];

        const linkedByAttributes = this.static().linkedByAttributes;

        for (const model of models) {
            for (const linkedByAttribute of linkedByAttributes) {
                const links = model.getAttribute(linkedByAttribute) as undefined|string|string[];
                if (Array.isArray(links)) {
                    foundValues.push(...links);
                } else if (links !== undefined) {
                    foundValues.push(links);
                }
            }
        }

        return foundValues;
    }

    /**
     * Merges values of the given attribute/property to a single array
     * @param property Name of the attribute/property
     * @returns An array of values from all parts
     */
    private mergeValuesFromParts(property: string): unknown[] {
        return this.mergeFromParts(part => part.getAttribute(property));
    }

    /**
     * Creates a single list of all entities from the given relation
     * @param relation Name of the relation
     * @returns An array of related entities from all parts
     */
    private mergeRelationValuesFromParts(relation: string): unknown[] {
        return this.mergeFromParts(part => 
            part.isRelationLoaded(relation) 
                ? part.requireRelation(relation).related
                : undefined);
    }

    /**
     * Applies the given getter to all parts and puts all received values into a single array.
     * If an array is returned from the getter, it is merged with a flat array.
     * @param valueGetter Function that returns a value for each part of the entity
     * @returns An array of values from all parts
     */
    private mergeFromParts(valueGetter: (part: T) => unknown|unknown[]): unknown[] {
        const result: unknown[] = [];
        for (const part of this.getParts()) {
            const value = valueGetter(part);
            if (Array.isArray(value)) {
                result.push(...value.filter(v => v !== undefined && v != null));
            } else if (value !== undefined && value !== null) {
                result.push(value);
            }
        }
        return result;
    }

}
