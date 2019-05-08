import Faker from 'faker';

import { Documents } from '@/engines/Engine';
import EngineHelper from '@/engines/EngineHelper';

import TestSuite from '../TestSuite';

export default class extends TestSuite {

    public static title: string = 'EngineHelper';

    private helper: EngineHelper;

    public setUp(): void {
        this.helper = new EngineHelper();
    }

    public testAttributeFilters(): void {
        const name = Faker.random.word();
        const documents: Documents = {
            first: { name },
            second: { name: Faker.random.word() },
        };

        const filteredDocuments = this.helper.filterDocuments(documents, {
            name,
        });

        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    }

    public testContainsFilters(): void {
        const name = Faker.random.word();
        const documents: Documents = {
            first: { names: [name, Faker.random.word()] },
            second: { names: [Faker.random.word()] },
        };

        const filteredDocuments = this.helper.filterDocuments(documents, {
            names: { $contains: [name] },
        });

        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    }

    public testInFilters(): void {
        const documents: Documents = {
            first: { name: Faker.random.word() },
            second: { name: Faker.random.word() },
        };

        const filteredDocuments = this.helper.filterDocuments(documents, {
            $in: ['first'],
        });

        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    }

}
