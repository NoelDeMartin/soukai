import 'soukai-bis/patch-zod';
import 'fake-indexeddb/auto';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import {
    ComputedAttribute,
    InMemoryEngine,
    SolidEngine,
    bootCoreModels,
    bootModels,
    setEngine,
    setRDFPrefixAliases,
    setRemoteEngine,
} from 'soukai-bis';
import { resetModelListeners } from 'soukai-bis/models/events';
import { forgetAuthorizationProtocols } from 'soukai-bis/models/internals/permissions';
import Animal from 'soukai-bis/testing/stubs/Animal';
import Episode from 'soukai-bis/testing/stubs/Episode';
import EpisodeWithTombstone from 'soukai-bis/testing/stubs/EpisodeWithTombstone';
import Group from 'soukai-bis/testing/stubs/Group';
import InverseEpisode from 'soukai-bis/testing/stubs/InverseEpisode';
import InverseSeason from 'soukai-bis/testing/stubs/InverseSeason';
import ManagerGrant from 'soukai-bis/testing/stubs/ManagerGrant';
import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import MovieWithHistory from 'soukai-bis/testing/stubs/MovieWithHistory';
import Playlist from 'soukai-bis/testing/stubs/Playlist';
import PlaylistWithHistory from 'soukai-bis/testing/stubs/PlaylistWithHistory';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Project from 'soukai-bis/testing/stubs/Project';
import Rating from 'soukai-bis/testing/stubs/Rating';
import Review from 'soukai-bis/testing/stubs/Review';
import ReviewedMovie from 'soukai-bis/testing/stubs/ReviewedMovie';
import Season from 'soukai-bis/testing/stubs/Season';
import SeasonWithTombstone from 'soukai-bis/testing/stubs/SeasonWithTombstone';
import Show from 'soukai-bis/testing/stubs/Show';
import ShowWithTombstone from 'soukai-bis/testing/stubs/ShowWithTombstone';
import Song from 'soukai-bis/testing/stubs/Song';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskWithCasts from 'soukai-bis/testing/stubs/TaskWithCasts';
import TaskWithHistory from 'soukai-bis/testing/stubs/TaskWithHistory';
import Todo from 'soukai-bis/testing/stubs/Todo';
import Track from 'soukai-bis/testing/stubs/Track';
import User from 'soukai-bis/testing/stubs/User';
import UserWithHistory from 'soukai-bis/testing/stubs/UserWithHistory';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { beforeEach, vi } from 'vite-plus/test';

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setRDFPrefixAliases({});
    forgetAuthorizationProtocols();
    resetModelListeners();
    vi.resetAllMocks();
    FakeServer.reset();
    ComputedAttribute.reset();
    ComputedAttribute.disableLoadingRelations();

    setEngine(new InMemoryEngine());
    setRemoteEngine(new SolidEngine({ fetch: FakeServer.fetch }));
    bootCoreModels({ reset: true });
    bootModels(
        {
            Animal,
            Episode,
            EpisodeWithTombstone,
            Group,
            InverseEpisode,
            InverseSeason,
            ManagerGrant,
            Movie,
            MovieWithHistory,
            MoviesCollection,
            Playlist,
            PlaylistWithHistory,
            Post,
            PostsCollection,
            Project,
            Rating,
            Review,
            ReviewedMovie,
            Season,
            SeasonWithTombstone,
            Show,
            ShowWithTombstone,
            Song,
            Task,
            TaskWithCasts,
            TaskWithHistory,
            Todo,
            Track,
            User,
            UserWithHistory,
            WatchAction,
        },
        { reset: true },
    );
});

installVitestSolidMatchers();
