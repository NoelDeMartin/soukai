import 'soukai-bis/patch-zod';
import 'fake-indexeddb/auto';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import { ComputedAttribute, bootCoreModels, bootModels, setRDFPrefixAliases } from 'soukai-bis';
import CascadingMovie from 'soukai-bis/jobs/sync/testing/stubs/CascadingMovie';
import Franchise from 'soukai-bis/jobs/sync/testing/stubs/Franchise';
import RatedMovie from 'soukai-bis/jobs/sync/testing/stubs/RatedMovie';
import SoukaiIndexedDB from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';
import MigratingTask from 'soukai-bis/models/concerns/testing/stubs/MigratingTask';
import { resetModelListeners } from 'soukai-bis/models/events';
import { forgetAuthorizationProtocols } from 'soukai-bis/models/internals/permissions';
import MultiClassTask from 'soukai-bis/models/interop/testing/stubs/MultiClassTask';
import Gallery from 'soukai-bis/models/ldp/testing/stubs/Gallery';
import Blogger from 'soukai-bis/models/relations/testing/stubs/Blogger';
import TodoWithHooks from 'soukai-bis/models/testing/stubs/TodoWithHooks';
import Sync from 'soukai-bis/sync/Sync';
import Animal from 'soukai-bis/testing/stubs/Animal';
import Episode from 'soukai-bis/testing/stubs/Episode';
import EpisodeWithTombstone from 'soukai-bis/testing/stubs/EpisodeWithTombstone';
import Group from 'soukai-bis/testing/stubs/Group';
import InverseEpisode from 'soukai-bis/testing/stubs/InverseEpisode';
import InverseSeason from 'soukai-bis/testing/stubs/InverseSeason';
import ManagerGrant from 'soukai-bis/testing/stubs/ManagerGrant';
import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import MoviesCollectionWithHistory from 'soukai-bis/testing/stubs/MoviesCollectionWithHistory';
import MovieWithHistory from 'soukai-bis/testing/stubs/MovieWithHistory';
import Playlist from 'soukai-bis/testing/stubs/Playlist';
import PlaylistWithHistory from 'soukai-bis/testing/stubs/PlaylistWithHistory';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Project from 'soukai-bis/testing/stubs/Project';
import Rating from 'soukai-bis/testing/stubs/Rating';
import RatingWithHistory from 'soukai-bis/testing/stubs/RatingWithHistory';
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
import { resetTestingEngines } from 'soukai-bis/testing/utils/engines';
import { beforeEach, vi } from 'vite-plus/test';

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setRDFPrefixAliases({});
    forgetAuthorizationProtocols();
    resetModelListeners();
    vi.resetAllMocks();
    FakeServer.reset();
    ComputedAttribute.reset();
    ComputedAttribute.disableLoadingRelations();

    resetTestingEngines();
    bootCoreModels({ reset: true });
    bootModels(
        {
            Animal,
            Blogger,
            CascadingMovie,
            Episode,
            EpisodeWithTombstone,
            Franchise,
            Gallery,
            Group,
            InverseEpisode,
            InverseSeason,
            ManagerGrant,
            MigratingTask,
            Movie,
            MoviesCollection,
            MoviesCollectionWithHistory,
            MovieWithHistory,
            MultiClassTask,
            Playlist,
            PlaylistWithHistory,
            Post,
            PostsCollection,
            Project,
            RatedMovie,
            Rating,
            RatingWithHistory,
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
            TodoWithHooks,
            Track,
            User,
            UserWithHistory,
            WatchAction,
        },
        { reset: true },
    );

    await SoukaiIndexedDB.clear();

    Sync.reset();
    SoukaiIndexedDB.reset();
    ComputedAttributesCache.reset();
});

installVitestSolidMatchers();
