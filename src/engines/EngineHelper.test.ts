import Faker from 'faker';

import {
    EngineDocument,
    EngineDocumentsCollection,
    EngineUpdates,
} from '@/engines/Engine';

import EngineHelper from './EngineHelper';

let helper: EngineHelper;

describe('EngineHelper', () => {

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
                    { $contains: [{ $eq: name }] },
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

    it('updates documents', () => {
        assertDocumentUpdate({
            original: { foo: 'bar', lorem: 'ipsum' },
            update: { foo: 'baz' },
            expected: { foo: 'baz', lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { foo: 'bar', lorem: 'ipsum' },
            update: { foo: { lorem: 'ipsum' } },
            expected: { foo: { lorem: 'ipsum' }, lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { foo: { lorem: 'ipsum' }, lorem: 'ipsum' },
            update: { foo: 'bar' },
            expected: { foo: 'bar', lorem: 'ipsum' },
        });
    });

    it('updates documents using $update', () => {
        assertDocumentUpdate({
            original: { foo: 'bar', lorem: 'ipsum' },
            update: { foo: { $update: 'baz' } },
            expected: { foo: 'baz', lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { foo: 'bar', lorem: 'ipsum' },
            update: { foo: { $update: { lorem: 'ipsum' } } },
            expected: { foo: { lorem: 'ipsum' }, lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { foo: { lorem: 'ipsum' }, lorem: 'ipsum' },
            update: { foo: { $update: 'bar' } },
            expected: { foo: 'bar', lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { foo: 'bar', lorem: 'ipsum' },
            update: { foo: { $update: { $update: 'baz' } } },
            expected: { foo: 'baz', lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { foo: ['bar'], lorem: 'ipsum' },
            update: { foo: { $update: { $push: 'baz' } } },
            expected: { foo: ['bar', 'baz'], lorem: 'ipsum' },
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

    it('updates documents using $updateItems', () => {
        // Arrange
        const document = {
            pirates: [
                { name: 'Monkey D. Luffy', affiliation: 'Straw Hat Pirates' },
                { name: 'Jimbei', affiliation: 'Sun Pirates' },
            ],
        };

        // Act
        helper.updateAttributes(document, {
            pirates: {
                $updateItems: {
                    $where: {
                        name: 'Jimbei',
                    },
                    $update: {
                        affiliation: 'Straw Hat Pirates',
                    },
                },
            },
        });

        // Assert
        expect(document.pirates[1].affiliation).toEqual('Straw Hat Pirates');
    });

    it('updates documents using $updateItems with advanced filters', () => {
        assertDocumentUpdate({
            original: { items: ['foo', 'bar', 'baz'] },
            update: {
                items: {
                    $updateItems: [
                        { $where: { $in: [1] }, $update: 'lorem' },
                        { $where: { $in: [2] }, $update: 'ipsum' },
                    ],
                },
            },
            expected: { items: ['foo', 'lorem', 'ipsum'] },
        });
    });

});

function assertDocumentUpdate(
    { original: document, update, expected }: {
        original: EngineDocument,
        update: EngineUpdates,
        expected: EngineDocument,
    },
) {
    helper.updateAttributes(document, update);

    expect(document).toEqual(expected);
}
