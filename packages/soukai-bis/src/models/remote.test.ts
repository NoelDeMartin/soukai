import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setRemoteEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { describe, expect, it } from 'vite-plus/test';

import Model from './Model';
import { bootModels, requireBootedModel } from './registry';
import { remote } from './remote';

describe('Remote models', () => {
    it('creates remote models', () => {
        // Arrange
        const remoteEngine = new SolidEngine();

        setRemoteEngine(remoteEngine);

        // Act
        const RemoteMovie = remote(Movie);

        // Assert
        expect(RemoteMovie.remote).toBe(true);
        expect(RemoteMovie.modelName).toEqual('RemoteMovie');
        expect(RemoteMovie.defaultContainerUrl).toEqual(Movie.defaultContainerUrl);
        expect(RemoteMovie.requireEngine()).toBe(remoteEngine);
        expect(requireBootedModel('RemoteMovie')).toBe(RemoteMovie);
        expect(new RemoteMovie({ title: 'Spirited Away' })).toBeInstanceOf(Movie);
        expect(Movie.remote).toBe(false);
    });

    it('reuses remote models', () => {
        expect(remote(Movie)).toBe(remote(Movie));
    });

    it('creates new remote models after resetting models', () => {
        // Arrange
        const RemoteMovie = remote(Movie);

        // Act
        bootModels({ Movie }, { reset: true });

        // Assert
        expect(remote(Movie)).not.toBe(RemoteMovie);
        expect(requireBootedModel('RemoteMovie')).toBe(remote(Movie));
    });

    it('returns models that are already remote', () => {
        expect(remote(TypeIndex)).toBe(TypeIndex);
    });

    it('fails with models that are not booted', () => {
        class Unbooted extends Model {}

        expect(() => remote(Unbooted)).toThrow(SoukaiError);
    });
});
