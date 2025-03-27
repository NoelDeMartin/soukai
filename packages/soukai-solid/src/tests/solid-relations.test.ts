import { beforeEach, describe, expect, it } from 'vitest';
import { bootModels, setEngine } from 'soukai';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';

import { SolidEngine } from 'soukai-solid/engines/SolidEngine';

import { loadFixture } from 'soukai-solid/testing/utils';
import Group from 'soukai-solid/testing/lib/stubs/Group';
import Person from 'soukai-solid/testing/lib/stubs/Person';

const fixture = (name: string) => loadFixture(`solid-relations/${name}`);

describe('Solid Relations', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Group, Person });
    });

    it('hasOne', async () => {
        // Arrange
        const group = new Group({
            url: 'https://onepiece.fandom.com/wiki/Straw_Hat_Pirates',
            name: 'Straw Hat Crew',
            creatorUrl: 'https://onepiece.fandom.com/wiki/Monkey_D._Luffy',
        });

        FakeServer.respondOnce(
            'https://onepiece.fandom.com/wiki/Monkey_D._Luffy',
            FakeResponse.success(fixture('luffy.ttl')),
        );

        // Act
        await group.loadRelation('creator');

        // Assert
        const creator = group.creator as Person;

        expect(creator).not.toBeUndefined();
        expect(creator.url).toEqual('https://onepiece.fandom.com/wiki/Monkey_D._Luffy');
        expect(creator.name).toEqual('Luffy');

        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetch).toHaveBeenCalledWith(
            'https://onepiece.fandom.com/wiki/Monkey_D._Luffy',
            expect.anything(),
        );
    });

});
