import 'soukai-bis/patch-zod';
import 'fake-indexeddb/auto';

import { beforeEach, vi } from 'vitest';
import { FakeServer } from '@noeldemartin/testing';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';

import { InMemoryEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import User from 'soukai-bis/testing/stubs/User';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';

beforeEach(() => {
    setEngine(new InMemoryEngine());
    bootCoreModels({ reset: true });
    bootModels(
        {
            Movie,
            MoviesCollection,
            User,
            Post,
            PostsCollection,
            WatchAction,
        },
        { reset: true },
    );

    FakeServer.reset();
    vi.resetAllMocks();
});

installVitestSolidMatchers();
