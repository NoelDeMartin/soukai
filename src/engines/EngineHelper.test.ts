import Faker from 'faker';

import { EngineDocumentsCollection } from '@/engines/Engine';

import EngineHelper from './EngineHelper';

describe('EngineHelper', () => {

    let helper: EngineHelper;

    beforeEach(() => {
        helper = new EngineHelper();
    });

    it('filters documents', () => {
        // Arrange
        const name = Faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { name },
            second: { name: Faker.random.word() },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            name,
        });

        // Assert
        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    });

    it('filters documents using $eq', () => {
        // Arrange
        const name = Faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { name },
            second: { name: Faker.random.word() },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            name: { $eq: name },
        });

        // Assert
        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    });

    it('filters documents using $contains', () => {
        // Arrange
        const name = Faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { names: [name, Faker.random.word()] },
            second: { names: [Faker.random.word()] },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            names: { $contains: [name] },
        });

        // Assert
        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    });

    it('filters documents using $contains with objects', () => {
        // Arrange
        const name = Faker.name.firstName();
        const documents: EngineDocumentsCollection = {
            first: {
                items: [
                    { name: Faker.name.firstName(), surname: Faker.name.lastName() },
                ],
            },
            second: {
                items: [
                    { name: Faker.name.firstName(), surname: Faker.name.lastName() },
                    { name, surname: Faker.name.lastName() },
                ],
            },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            items: {
                $contains: { name },
            },
        });

        // Assert
        expect(filteredDocuments).toEqual({ second: documents.second });
    });

    it('filters documents using $in', () => {
        // Arrange
        const documents: EngineDocumentsCollection = {
            first: { name: Faker.random.word() },
            second: { name: Faker.random.word() },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            $in: ['first'],
        });

        // Assert
        expect(filteredDocuments).toEqual({
            first: documents.first,
        });
    });

    it('filters documents using $or', () => {
        // Arrange
        const name = Faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { names: [name, Faker.random.word()] },
            second: { names: name },
            third: { names: [Faker.random.word()] },
            fourth: { names: Faker.random.word() },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            names: {
                $or: [
                    { $contains: [name] },
                    { $eq: name },
                ],
            },
        });

        // Assert
        expect(filteredDocuments).toEqual({
            first: documents.first,
            second: documents.second,
        });
    });

    it('filters nested array values', () => {
        // Arrange
        const documents: EngineDocumentsCollection = {
            spiritedaway: { releases: [{ title: 'Spirited Away', actors: ['Rumi Hiiragi', 'Miyu Irino'] }] },
            thetrumanshow: { releases: [{ title: 'The Truman Show', stars: 'Jim Carrey' }] },
            yesman: { releases: [{ title: 'The Truman Show', stars: ['Jim Carrey', 'Zooey Deschanel'] }] },
        };

        // Act
        const filteredDocuments = helper.filterDocuments(documents, {
            releases: {
                $contains: {
                    stars: {
                        $or: [
                            { $contains: ['Jim Carrey'] },
                            { $eq: 'Jim Carrey' },
                        ],
                    },
                },
            },
        });

        // Assert
        expect(filteredDocuments).toEqual({
            thetrumanshow: documents.thetrumanshow,
            yesman: documents.yesman,
        });
    });

    it('updates documents using $push', () => {
        // Arrange
        const existingWord = Faker.random.word();
        const newWord = Faker.random.word();
        const document = { words: [existingWord] };

        // Act
        helper.updateAttributes(document, { words: { $push: newWord } });

        // Assert
        expect(document.words).toEqual([existingWord, newWord]);
    });

});
