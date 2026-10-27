import { fakeResourceUrl } from '@noeldemartin/testing';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { describe, expect, it } from 'vite-plus/test';
import z from 'zod';

import type BelongsToOneRelation from './BelongsToOneRelation';
import { belongsToOne, hasOne } from './fluent';
import type HasOneRelation from './HasOneRelation';

describe('HasOneRelation', () => {
    it('loads related model', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });
        const post = await Post.create({
            title: 'Hello World',
            authorUrl: user.url,
        });

        // Act
        await user.loadRelation('lastPost');

        // Assert
        expect(user.lastPost).toBeInstanceOf(Post);
        expect(user.lastPost?.url).toBe(post.url);
        expect(user.lastPost?.title).toBe('Hello World');
    });

    it('returns null when related model is missing', async () => {
        // Arrange
        const user = await User.create({ name: 'Bob' });

        // Act
        await user.loadRelation('lastPost');

        // Assert
        expect(user.lastPost).toBeNull();
    });

    it('attaches related models', () => {
        // Arrange
        const movieUrl = fakeResourceUrl();
        const movie = new Movie({ url: movieUrl, title: 'Spiderman' });
        const action = new WatchAction({ startTime: new Date(), objectUrl: movieUrl });

        // Act
        movie.relatedAction.attach(action);

        // Assert
        expect(movie.action).toBe(action);
        expect(action.objectUrl).toBe(movie.url);
    });

    it('creates related models using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });

        // Act
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Assert
        expect(action.objectUrl).toBe(movie.url);
        expect(action.objectUrl?.startsWith(movie.requireDocumentUrl())).toBe(true);
    });

    it('loads related model using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });
        const freshMovie = new Movie({ url: movie.url, title: 'Spiderman' });
        freshMovie.setExists(true);

        // Act
        await freshMovie.loadRelation('action');

        // Assert
        expect(freshMovie.action).toBeInstanceOf(WatchAction);
        expect(freshMovie.action?.url).toBe(action.url);
    });

    it('reuses document models when loading related models using same document', async () => {
        // Arrange
        class MovieWithLastAction extends defineSchema(Movie, {
            relations: {
                lastAction: hasOne(() => WatchAction, 'objectUrl')
                    .usingSameDocument()
                    .autoload(false),
            },
        }) {}

        bootModels({ MovieWithLastAction });

        const movie = await MovieWithLastAction.create({ title: 'Spiderman' });

        await movie.relatedAction?.create({ startTime: new Date() });

        const freshMovie = await MovieWithLastAction.findOrFail(movie.url);
        const action = freshMovie.action;

        // Act
        await freshMovie.loadRelation('lastAction');

        // Assert
        expect(freshMovie.getRelation('lastAction').related).toBe(action);
    });

    it('detaches related models using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        movie.relatedAction.detach();

        const freshActionBeforeSave = await WatchAction.findOrFail(action.requireUrl());

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());
        const freshAction = await WatchAction.findOrFail(action.requireUrl());

        expect(movie.action).toBeNull();
        expect(action.objectUrl).toBeUndefined();
        expect(action.exists()).toBe(true);
        expect(freshActionBeforeSave.objectUrl).toEqual(movie.url);
        expect(freshMovie.action).toBeNull();
        expect(freshAction.objectUrl).toBeUndefined();
    });

    it('detaches and deletes related models using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        movie.relatedAction.detach({ delete: true });

        const isDirty = movie.isDirty();
        const freshActionBeforeSave = await WatchAction.find(action.requireUrl());

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());
        const freshAction = await WatchAction.find(action.requireUrl());

        expect(isDirty).toBe(true);
        expect(freshActionBeforeSave).not.toBeNull();
        expect(movie.action).toBeNull();
        expect(action.exists()).toBe(false);
        expect(action.tombstone).toBeDefined();
        expect(freshMovie.action).toBeNull();
        expect(freshAction).toBeNull();
    });

    it('drops new related models when detached', async () => {
        // Arrange
        const movie = new Movie({ title: 'Spiderman' });
        const action = movie.relatedAction.attach({ startTime: new Date() });

        // Act
        movie.relatedAction.detach({ delete: true });

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());

        expect(action.exists()).toBe(false);
        expect(freshMovie.action).toBeNull();
    });

    it('detaches and deletes nested related models using same document', async () => {
        // Arrange
        class Rating extends defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Rating',
            fields: { ratingValue: z.number() },
        }) {}

        class Review extends defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Review',
            fields: {
                itemReviewedUrl: z.url().rdfProperty('itemReviewed'),
                reviewRatingUrl: z.url().rdfProperty('reviewRating').optional(),
            },
            relations: {
                rating: belongsToOne(Rating, 'reviewRatingUrl').usingSameDocument(),
            },
        }) {
            declare public relatedRating: BelongsToOneRelation<this, Rating, typeof Rating>;
        }

        class ReviewedMovie extends defineSchema(Movie, {
            relations: {
                review: hasOne(Review, 'itemReviewedUrl').usingSameDocument(),
            },
        }) {
            declare public review?: Review;
            declare public relatedReview: HasOneRelation<this, Review, typeof Review>;
        }

        bootModels({ Rating, Review, ReviewedMovie });

        const movie = await ReviewedMovie.create({ title: 'Spiderman' });
        const review = movie.relatedReview.attach({}, { mintUrl: true });
        const rating = review.relatedRating.attach({ ratingValue: 8 }, { mintUrl: true });

        await movie.save();

        // Act
        review.relatedRating.detach({ delete: true });
        movie.relatedReview.detach({ delete: true });

        await movie.save();

        // Assert
        const freshMovie = await ReviewedMovie.findOrFail(movie.requireUrl());

        expect(review.exists()).toBe(false);
        expect(rating.exists()).toBe(false);
        expect(freshMovie.review).toBeNull();
        expect(await Review.find(review.requireUrl())).toBeNull();
        expect(await Rating.find(rating.requireUrl())).toBeNull();
    });

    it('attaches detached models again', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        movie.relatedAction.detach();
        movie.relatedAction.attach(action);

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());

        expect(movie.relatedAction.__detachedModels).toEqual([]);
        expect(freshMovie.action?.url).toEqual(action.url);
    });

    it('attaches detached models marked for deletion again', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        movie.relatedAction.detach({ delete: true });
        movie.relatedAction.attach(action);

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());

        expect(action.isMarkedForDeletion()).toBe(false);
        expect(action.exists()).toBe(true);
        expect(freshMovie.action?.url).toEqual(action.url);
    });

    it('attaches detached models marked for deletion again from inverse relations', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        movie.relatedAction.detach({ delete: true });
        action.relatedMovie.attach(movie);

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());

        expect(action.isMarkedForDeletion()).toBe(false);
        expect(action.exists()).toBe(true);
        expect(movie.relatedAction.__detachedModels).toEqual([]);
        expect(freshMovie.action?.url).toEqual(action.url);
    });

    it('ignores detached models deleted before saving', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        movie.relatedAction.detach();

        await action.delete();

        movie.title = 'Spider-Man';

        await movie.save();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.requireUrl());

        expect(action.exists()).toBe(false);
        expect(movie.relatedAction.__detachedModels).toEqual([]);
        expect(freshMovie.title).toEqual('Spider-Man');
        expect(freshMovie.action).toBeNull();
    });

    it('returns null when trying to load from an unsaved parent using same document', async () => {
        // Arrange
        const movie = new Movie({ url: 'http://example.com/movie', title: 'Spiderman' });

        // Act
        const action = await movie.relatedAction.load();

        // Assert
        expect(action).toBeNull();
    });
});
