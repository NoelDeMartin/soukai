import 'soukai-bis/patch-zod';
import 'fake-indexeddb/auto';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import { ComputedAttribute, InMemoryEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';
import { forgetAuthorizationProtocols } from 'soukai-bis/models/concerns/authorization';
import Animal from 'soukai-bis/testing/stubs/Animal';
import Episode from 'soukai-bis/testing/stubs/Episode';
import InverseEpisode from 'soukai-bis/testing/stubs/InverseEpisode';
import InverseSeason from 'soukai-bis/testing/stubs/InverseSeason';
import ManagerGrant from 'soukai-bis/testing/stubs/ManagerGrant';
import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import Playlist from 'soukai-bis/testing/stubs/Playlist';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Project from 'soukai-bis/testing/stubs/Project';
import Rating from 'soukai-bis/testing/stubs/Rating';
import Review from 'soukai-bis/testing/stubs/Review';
import ReviewedMovie from 'soukai-bis/testing/stubs/ReviewedMovie';
import Season from 'soukai-bis/testing/stubs/Season';
import Show from 'soukai-bis/testing/stubs/Show';
import Song from 'soukai-bis/testing/stubs/Song';
import Task from 'soukai-bis/testing/stubs/Task';
import Track from 'soukai-bis/testing/stubs/Track';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { afterEach, beforeEach, vi } from 'vite-plus/test';

beforeEach(() => {
    setEngine(new InMemoryEngine());
    bootCoreModels({ reset: true });
    bootModels(
        {
            Animal,
            Episode,
            InverseEpisode,
            InverseSeason,
            ManagerGrant,
            Movie,
            MoviesCollection,
            Playlist,
            Post,
            PostsCollection,
            Project,
            Rating,
            Review,
            ReviewedMovie,
            Season,
            Show,
            Song,
            Task,
            Track,
            User,
            WatchAction,
        },
        { reset: true },
    );

    FakeServer.reset();
    forgetAuthorizationProtocols();
    vi.resetAllMocks();
    ComputedAttribute.disableLoadingRelations();
});

afterEach(() => {
    vi.useRealTimers();
    ComputedAttribute.enableLoadingRelations();
});

installVitestSolidMatchers();
