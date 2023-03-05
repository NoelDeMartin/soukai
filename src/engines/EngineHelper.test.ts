import { faker } from '@noeldemartin/faker';

import type {
    EngineDocument,
    EngineDocumentsCollection,
    EngineUpdates,
} from '@/engines/Engine';

import { EngineHelper } from './EngineHelper';

let helper: EngineHelper;

describe('EngineHelper', () => {

    beforeEach(() => {
        helper = new EngineHelper();
    });

    it('filters documents', () => {
        // Arrange
        const name = faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { name },
            second: { name: faker.random.word() },
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
        const name = faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { name },
            second: { name: faker.random.word() },
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
        const name = faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { names: [name, faker.random.word()] },
            second: { names: [faker.random.word()] },
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
        const name = faker.name.firstName();
        const documents: EngineDocumentsCollection = {
            first: {
                items: [
                    { name: faker.name.firstName(), surname: faker.name.lastName() },
                ],
            },
            second: {
                items: [
                    { name: faker.name.firstName(), surname: faker.name.lastName() },
                    { name, surname: faker.name.lastName() },
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
            first: { name: faker.random.word() },
            second: { name: faker.random.word() },
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
        const name = faker.random.word();
        const documents: EngineDocumentsCollection = {
            first: { names: [name, faker.random.word()] },
            second: { names: name },
            third: { names: [faker.random.word()] },
            fourth: { names: faker.random.word() },
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
        const existingWord = faker.random.word();
        const newWord = faker.random.word();
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
        expect(document.pirates[1]?.affiliation).toEqual('Straw Hat Pirates');
    });

    it('updates documents using $updateItems with advanced filters and operations', () => {
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

        assertDocumentUpdate({
            original: { items: [{ foo: 'bar' }, { john: 'Doe' }] },
            update: {
                items: {
                    $updateItems: {
                        $where: { $in: [1] },
                        $update: { $unset: 'john' },
                    },
                },
            },
            expected: { items: [{ foo: 'bar' }, {}] },
        });

        assertDocumentUpdate({
            original: { scabbards: [{ name: 'Kinemon' }, { name: 'Kanjuro' }, { name: 'Raizo' }] },
            update: {
                scabbards: {
                    $updateItems: {
                        $where: { name: { $in: ['Kanjuro'] } },
                        $unset: true,
                    },
                },
            },
            expected: { scabbards: [{ name: 'Kinemon' }, { name: 'Raizo' }] },
        });

        assertDocumentUpdate({
            original: {
                bands: [
                    {
                        name: 'mugiwara',
                        members: { name: 'luffy' },
                    },
                ],
            },
            update: {
                bands: {
                    $updateItems: {
                        $where: { name: 'mugiwara' },
                        $update: {
                            members: [
                                { name: 'luffy' },
                                { name: 'zoro' },
                            ],
                        },
                    },
                },
            },
            expected: {
                bands: [
                    {
                        name: 'mugiwara',
                        members: [
                            { name: 'luffy' },
                            { name: 'zoro' },
                        ],
                    },
                ],
            },
        });
    });

    it('updates documents using $unset', () => {
        assertDocumentUpdate({
            original: { foo: ['bar'], lorem: 'ipsum' },
            update: { $unset: 'foo' },
            expected: { lorem: 'ipsum' },
        });

        assertDocumentUpdate({
            original: { lorem: { ipsum: 'dolor', foo: 'bar' } },
            update: { lorem: { ipsum: { $unset: true } } },
            expected: { lorem: { foo: 'bar' } },
        });

        assertDocumentUpdate({
            original: { lorem: { ipsum: 'dolor', foo: 'bar' } },
            update: { lorem: { ipsum: { $unset: true } } },
            expected: { lorem: { foo: 'bar' } },
        });

        assertDocumentUpdate({
            original: { lorem: { ipsum: 'dolor', foo: 'bar', john: 'doe' } },
            update: { lorem: { $unset: ['ipsum', 'foo'] } },
            expected: { lorem: { john: 'doe' } },
        });

        assertDocumentUpdate({
            original: { ipsum: 'dolor', foo: 'bar', john: 'doe' },
            update: { $unset: ['ipsum', 'foo'] },
            expected: { john: 'doe' },
        });
    });


    it('updates documents using $overwrite', () => {
        assertDocumentUpdate({
            original: { foo: ['bar'], lorem: 'ipsum' },
            update: { $overwrite: { ipsum: 'bar' } },
            expected: { ipsum: 'bar' },
        });

        assertDocumentUpdate({
            original: { lorem: { ipsum: 'dolor', foo: 'bar' } },
            update: { lorem: { ipsum: { $overwrite: 'foobar' } } },
            expected: { lorem: { ipsum: 'foobar', foo: 'bar' } },
        });
    });

    it('combines update operations using $apply', () => {
        // Arrange
        const document = {
            strawHatCrew: [
                { name: 'Monkey D. Luffy', bounty: 500000000 },
            ],
        };

        // Act
        helper.updateAttributes(document, {
            strawHatCrew: {
                $apply: [
                    {
                        $updateItems: {
                            $where: {
                                name: 'Monkey D. Luffy',
                            },
                            $update: {
                                bounty: 1500000000,
                            },
                        },
                    },
                    {
                        $push: {
                            name: 'Jimbei',
                            bounty: 438000000,
                        },
                    },
                ],
            },
        });

        // Assert
        expect(document.strawHatCrew[0]?.bounty).toEqual(1500000000);
        expect(document.strawHatCrew[1]).toEqual({
            name: 'Jimbei',
            bounty: 438000000,
        });
    });

});

function assertDocumentUpdate(
    { original: document, update, expected }: {
        original: EngineDocument;
        update: EngineUpdates;
        expected: EngineDocument;
    },
) {
    helper.updateAttributes(document, update);

    expect(document).toEqual(expected);
}
