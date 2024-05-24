/* eslint-disable no-console */
import { ProxyEngine } from '@/engines/ProxyEngine';
import type { Engine } from '@/engines/Engine';

export class LogEngine<SubjectEngine extends Engine = Engine> extends ProxyEngine<SubjectEngine> {

    constructor(subject: SubjectEngine) {
        super(subject, {
            async create(...args) {
                console.log('CREATE', ...args);

                try {
                    const resultId = await subject.create(...args);

                    console.log('CREATED', resultId);

                    return resultId;
                } catch (error) {
                    console.error(error);

                    throw error;
                }
            },
            async readOne(...args) {
                console.log('READ ONE', ...args);

                try {
                    const document = await subject.readOne(...args);

                    console.log('FOUND', document);

                    return document;
                } catch (error) {
                    console.error(error);

                    throw error;
                }
            },
            async readMany(...args) {
                console.log('READ ALL', ...args);

                try {
                    const documents = await subject.readMany(...args);

                    console.log('FOUND', documents);

                    return documents;
                } catch (error) {
                    console.error(error);

                    throw error;
                }
            },
            async update(...args) {
                console.log('UPDATE', ...args);

                try {
                    await subject.update(...args);

                    console.log('UPDATED');
                } catch (error) {
                    console.error(error);

                    throw error;
                }
            },
            async delete(...args) {
                console.log('DELETE', ...args);

                try {
                    await subject.delete(...args);

                    console.log('DELETED');
                } catch (error) {
                    console.error(error);

                    throw error;
                }
            },
        });
    }

}
