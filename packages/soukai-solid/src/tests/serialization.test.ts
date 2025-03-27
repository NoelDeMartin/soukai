import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import type { JsonLD } from '@noeldemartin/solid-utils';

import { InMemoryEngine, bootModels, setEngine } from 'soukai';
import { SolidEngine } from 'soukai-solid/engines/SolidEngine';

import Recipe from 'soukai-solid/testing/lib/stubs/Recipe';
import RecipeInstructionsStep from 'soukai-solid/testing/lib/stubs/RecipeInstructionsStep';
import { loadFixture } from 'soukai-solid/testing/utils';

function expectRamen(ramen: Recipe) {
    expect(ramen.name).toEqual('Ramen');
    expect(ramen.instructionsSteps).toHaveLength(3);
}

describe('Serialization', () => {

    beforeEach(() => {
        setEngine(new InMemoryEngine());
        bootModels({ Recipe, RecipeInstructionsStep });
    });

    it('Imports from offline JSON-LD', async () => {
        // Arrange
        const jsonld = loadFixture<JsonLD>('recipes/ramen-offline.jsonld');

        // Act
        const ramen = await Recipe.createFromJsonLD(jsonld);

        // Assert
        expectRamen(ramen);
    });

    it('Imports from hosted JSON-LD', async () => {
        // Arrange
        const jsonld = loadFixture<JsonLD>('recipes/ramen-hosted.jsonld');

        // Act
        const ramen = await Recipe.createFromJsonLD(jsonld);

        // Assert
        expectRamen(ramen);
    });

    it('Maintains encoding', async () => {
        // Arrange - Prepare server
        setEngine(new SolidEngine(FakeServer.fetch));

        FakeServer.respondOnce('https://pod.com/cookbook/ラーメン', FakeResponse.notFound());
        FakeServer.respondOnce('https://pod.com/cookbook/ラーメン', FakeResponse.success());

        // Arrange - Create recipe and fake server url encoding
        const ramen = await Recipe.at('https://pod.com/cookbook/').create({
            url: 'https://pod.com/cookbook/ラーメン',
            name: 'ラーメン',
            instructionsStepUrls: ['https://pod.com/cookbook/垂れ'],
        });
        const turtle = await ramen.toTurtle();

        FakeServer.respondOnce(
            'https://pod.com/cookbook/ラーメン',
            FakeResponse.success(
                turtle.replace(
                    'https://pod.com/cookbook/垂れ',
                    `https://pod.com/cookbook/${encodeURIComponent('垂れ')}`,
                ),
            ),
        );

        // Act
        const freshRamen = await ramen.fresh();

        // Assert
        expect(freshRamen.url).toEqual('https://pod.com/cookbook/ラーメン');
        expect(freshRamen.name).toEqual('ラーメン');
        expect(freshRamen.instructionsStepUrls[0]).toEqual('https://pod.com/cookbook/垂れ');
    });

});
