import 'soukai-bis/patch-zod';

import { beforeEach, vi } from 'vitest';
import { defineIRIPrefix } from '@noeldemartin/solid-utils';
import { FakeServer } from '@noeldemartin/testing';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';

import { InMemoryEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import Person from 'soukai-bis/testing/stubs/Person';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';

beforeEach(() => {
    setEngine(new InMemoryEngine());
    bootCoreModels(true);
    bootModels(
        {
            Movie,
            MoviesCollection,
            Person,
            Post,
            PostsCollection,
            WatchAction,
        },
        true,
    );

    FakeServer.reset();
    vi.resetAllMocks();
});

defineIRIPrefix('crdt', 'https://vocab.noeldemartin.com/crdt/');
installVitestSolidMatchers();
