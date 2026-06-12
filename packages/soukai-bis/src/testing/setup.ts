import 'soukai-bis/patch-zod';
import 'fake-indexeddb/auto';

import { beforeEach, vi } from 'vitest';
import { FakeServer } from '@noeldemartin/testing';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';

import { InMemoryEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import Episode from 'soukai-bis/testing/stubs/Episode';
import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Season from 'soukai-bis/testing/stubs/Season';
import Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';

beforeEach(() => {
    setEngine(new InMemoryEngine());
    bootCoreModels({ reset: true });
    bootModels(
        {
            Episode,
            Movie,
            MoviesCollection,
            Post,
            PostsCollection,
            Season,
            Show,
            User,
            WatchAction,
        },
        { reset: true },
    );

    FakeServer.reset();
    vi.resetAllMocks();
});

installVitestSolidMatchers();
