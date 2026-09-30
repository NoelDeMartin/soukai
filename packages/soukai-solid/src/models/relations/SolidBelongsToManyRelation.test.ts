import { faker } from '@noeldemartin/faker';
import { expandIRI, normalizeJsonLD } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { uuid } from '@noeldemartin/utils';
import type { Tuple } from '@noeldemartin/utils';
import { bootModels } from 'soukai';
import type { EngineDocument, Relation } from 'soukai';
import { SolidModel } from 'soukai-solid/models/SolidModel';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import Group from 'soukai-solid/testing/lib/stubs/Group';
import { stubGroupJsonLD, stubPersonJsonLD } from 'soukai-solid/testing/lib/stubs/helpers';
import Person from 'soukai-solid/testing/lib/stubs/Person';
import { useFakeClock } from 'soukai-solid/testing/utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

class PersonWithHistory extends Person {
    public static timestamps = true;
    public static history = true;

    public friendsRelationship(): Relation {
        return this.belongsToMany(Person, 'friendUrls').usingSameDocument(true).onDelete('cascade');
    }
}

describe('SolidBelongsToManyRelation', () => {
    beforeAll(() => bootModels({ Group, Person, PersonWithHistory }));
    beforeEach(() => FakeSolidEngine.use());

    it('uses document models for resolving models', async () => {
        // Arrange
        const firstContainerUrl = fakeContainerUrl();
        const secondContainerUrl = fakeContainerUrl();
        const firstDocumentUrl = fakeDocumentUrl({ containerUrl: firstContainerUrl });
        const secondDocumentUrl = fakeDocumentUrl({ containerUrl: secondContainerUrl });
        const thirdDocumentUrl = fakeDocumentUrl({ containerUrl: secondContainerUrl });
        const firstFriendUrl = firstDocumentUrl + '#it';
        const firstFriendName = faker.random.word();
        const secondFriendUrl = secondDocumentUrl + '#it';
        const secondFriendName = faker.random.word();
        const thirdFriendUrl = thirdDocumentUrl + '#it';
        const thirdFriendName = faker.random.word();
        const person = new Person(
            {
                name: faker.random.word(),
                friendUrls: [firstFriendUrl, secondFriendUrl, thirdFriendUrl],
            },
            true,
        );

        FakeSolidEngine.database[firstContainerUrl] = {
            [firstDocumentUrl]: stubPersonJsonLD(firstFriendUrl, firstFriendName),
        };

        FakeSolidEngine.database[secondContainerUrl] = {
            [secondDocumentUrl]: stubPersonJsonLD(secondFriendUrl, secondFriendName),
            [thirdDocumentUrl]: stubPersonJsonLD(thirdFriendUrl, thirdFriendName),
        };

        // Act
        await person.loadRelation('friends');

        // Assert
        expect(person.friends).toHaveLength(3);

        const friends = person.friends as Tuple<Person, 3>;
        expect(friends[0].url).toEqual(firstFriendUrl);
        expect(friends[0].name).toEqual(firstFriendName);
        expect(friends[1].url).toEqual(secondFriendUrl);
        expect(friends[1].name).toEqual(secondFriendName);
        expect(friends[2].url).toEqual(thirdFriendUrl);
        expect(friends[2].name).toEqual(thirdFriendName);

        expect(FakeSolidEngine.readMany).toHaveBeenCalledTimes(2);

        const personFilters = {
            '@graph': {
                $contains: {
                    '@type': {
                        $or: [
                            { $contains: ['Person'] },
                            { $contains: [expandIRI('foaf:Person')] },
                            { $eq: 'Person' },
                            { $eq: expandIRI('foaf:Person') },
                        ],
                    },
                },
            },
        };
        expect(FakeSolidEngine.readManySpy.mock.calls[0]?.[1]).toEqual({
            $in: [firstDocumentUrl],
            ...personFilters,
        });
        expect(FakeSolidEngine.readManySpy.mock.calls[1]?.[1]).toEqual({
            $in: [secondDocumentUrl, thirdDocumentUrl],
            ...personFilters,
        });
    });

    it('synchronizes from different operations', async () => {
        // Arrange
        useFakeClock();

        const source = await PersonWithHistory.create({ name: 'Luffy' });
        const target = source.clone({ clean: true });

        // Act
        await source.relatedFriends.create({ name: 'Zoro' });

        source.relatedFriends.attach({ name: 'Nami' });
        source.relatedFriends.attach({ name: 'Usopp' });

        vi.advanceTimersByTime(1);
        await source.save();
        await SolidModel.synchronize(source, target);

        // Assert
        expect(target.friends).toHaveLength(3);

        expect(target.friends?.[0]?.name).toEqual('Zoro');
        expect(target.friends?.[1]?.name).toEqual('Nami');
        expect(target.friends?.[2]?.name).toEqual('Usopp');
    });

    it('Loads inverse relationships', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const personUrl = fakeResourceUrl({ documentUrl });
        const groupUrl = fakeResourceUrl({ documentUrl, hash: uuid() });

        FakeSolidEngine.database[containerUrl] = {
            [documentUrl]: (await normalizeJsonLD({
                '@graph': [
                    stubPersonJsonLD(personUrl)['@graph'][0],
                    stubGroupJsonLD(groupUrl, 'Team', { members: [personUrl] })['@graph'][0],
                ],
            })) as EngineDocument,
        };

        // Act
        const person = await Person.find(personUrl);

        // Assert
        expect(person).toBeInstanceOf(Person);
        expect(person?.group).toBeInstanceOf(Group);
        expect(person?.group?.members).toHaveLength(1);
        expect(person?.group?.members?.[0]).toBe(person);
    });
});
