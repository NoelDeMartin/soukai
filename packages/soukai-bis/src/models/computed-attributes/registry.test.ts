import { describe, expect, it } from 'vitest';
import Episode from 'soukai-bis/testing/stubs/Episode';
import Post from 'soukai-bis/testing/stubs/Post';
import Season from 'soukai-bis/testing/stubs/Season';
import Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';

import { getComputedAttributes } from './registry';

describe('Computed attributes registry', () => {

    it('populates registries during boot', () => {
        expect(getComputedAttributes(User)).toEqual(['postTitles']);
        expect(getComputedAttributes(Post)).toEqual(['author.postTitles']);
        expect(getComputedAttributes(Show)).toEqual(['pendingEpisodeDates']);
        expect(getComputedAttributes(Season)).toEqual(['show.pendingEpisodeDates']);
        expect(getComputedAttributes(Episode)).toEqual(['season.show.pendingEpisodeDates']);
        expect(getComputedAttributes(WatchAction)).toEqual(['episode.season.show.pendingEpisodeDates']);
    });

});
