import { IndexedDBMap } from '@noeldemartin/utils';
import type { Engine, EngineDocument } from 'soukai';
import { renderRDFDateValue } from 'soukai-solid/solid/utils/dates';

interface DocumentMetadata {
    modifiedAt: number;
    tombstone?: {
        url: string;
        resourceUrl: string;
    };
}

export default class DocumentsCache {

    protected engine: Engine;
    protected metadata: IndexedDBMap<DocumentMetadata>;
    protected active: Partial<Record<string, boolean>> = {};

    constructor(name: string, engine: Engine) {
        this.engine = engine;
        this.metadata = new IndexedDBMap(`${name}-documents-cache`);
    }

    public has(collection: string, id: string): boolean {
        return !!this.active[this.getDocumentKey(collection, id)];
    }

    public async get(collection: string, id: string): Promise<EngineDocument | null> {
        const metadata = await this.metadata.get(this.getDocumentKey(collection, id));

        if (metadata?.tombstone) {
            const date = new Date(metadata.modifiedAt);

            return {
                '@graph': [
                    {
                        '@id': metadata.tombstone.url,
                        '@type': 'https://vocab.noeldemartin.com/crdt/Tombstone',
                        'https://vocab.noeldemartin.com/crdt/deletedAt': {
                            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                            '@value': renderRDFDateValue(date),
                        },
                        'https://vocab.noeldemartin.com/crdt/resource': {
                            '@id': metadata.tombstone.resourceUrl,
                        },
                    },
                ],
            };
        }

        return this.engine.readOne(collection, id);
    }

    public async remember(
        collection: string,
        id: string,
        modifiedAt: number | Date,
        options: {
            tombstone?: {
                url: string;
                resourceUrl: string;
            };
        } = {},
    ): Promise<void> {
        const metadata: DocumentMetadata = {
            modifiedAt: typeof modifiedAt === 'number' ? modifiedAt : modifiedAt.getTime(),
        };

        if (options.tombstone) {
            metadata.tombstone = options.tombstone;
        }

        await this.metadata.set(this.getDocumentKey(collection, id), metadata);
    }

    public async forget(collection: string, id: string): Promise<void> {
        await this.metadata.delete(this.getDocumentKey(collection, id));
    }

    public async activate(collection: string, id: string, modifiedAt: number): Promise<void> {
        const meta = await this.metadata.get(this.getDocumentKey(collection, id));

        this.active[this.getDocumentKey(collection, id)] = !!meta?.modifiedAt && meta.modifiedAt >= modifiedAt;
    }

    public async clear(): Promise<void> {
        await this.metadata.clear();

        this.metadata.close();
    }

    protected getDocumentKey(collection: string, id: string): string {
        return `${collection}-${id}`;
    }

}
