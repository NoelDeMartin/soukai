/* eslint-disable no-console */
import type {
    Engine,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from '@/engines/Engine';
import type { ProxyEngine } from '@/engines/ProxyEngine';

export class LogEngine<SubjectEngine extends Engine = Engine> implements Engine, ProxyEngine {

    public readonly subject: SubjectEngine;

    constructor(subject: SubjectEngine) {
        this.subject = subject;
    }

    public getProxySubject(): Engine {
        return this.subject;
    }

    public async create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        console.log('CREATE', collection, document, id);

        try {
            const resultId = await this.subject.create(collection, document, id);

            console.log('CREATED', resultId);

            return resultId;
        } catch (error) {
            console.error(error);

            throw error;
        }
    }

    public async readOne(collection: string, id: string): Promise<EngineDocument> {
        console.log('READ ONE', collection, id);

        try {
            const document = await this.subject.readOne(collection, id);

            console.log('FOUND', document);

            return document;
        } catch (error) {
            console.error(error);

            throw error;
        }
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        console.log('READ ALL', collection, filters);

        try {
            const documents = await this.subject.readMany(collection, filters);

            console.log('FOUND', documents);

            return documents;
        } catch (error) {
            console.error(error);

            throw error;
        }
    }

    public async update(collection: string, id: string, updates: EngineUpdates): Promise<void> {
        console.log('UPDATE', collection, id, updates);

        try {
            await this.subject.update(collection, id, updates);

            console.log('UPDATED');
        } catch (error) {
            console.error(error);

            throw error;
        }
    }

    public async delete(collection: string, id: string): Promise<void> {
        console.log('DELETE', collection, id);

        try {
            await this.subject.delete(collection, id);

            console.log('DELETED');
        } catch (error) {
            console.error(error);

            throw error;
        }
    }

}
