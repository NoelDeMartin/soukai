import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import type { ModelWithTimestamps, ModelWithUrl } from 'soukai-bis/models/types';
import Movie from 'soukai-bis/testing/stubs/Movie';
import ReviewedMovie from 'soukai-bis/testing/stubs/ReviewedMovie';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { metadataJsonLD } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

describe('BelongsToOneRelation', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it("doesn't clear foreign keys when detaching from models marked for deletion", async () => {
        // Arrange
        const movie = await ReviewedMovie.create({ title: 'Spiderman' });
        const review = movie.relatedReview.attach({}, { mintUrl: true });
        const rating = review.relatedRating.attach({ ratingValue: 8 }, { mintUrl: true });

        await movie.save();

        // Act
        review.markForDeletion();
        review.relatedRating.detach({ delete: true });

        // Assert
        expect(review.reviewRatingUrl).toEqual(rating.url);
        expect(review.isDirty('reviewRatingUrl')).toBe(false);
        expect(rating.isMarkedForDeletion()).toBe(true);
    });

    it('creates related models', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Whisper of the Heart' });

        // Act
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Assert
        expect(movie.action).toBeInstanceOf(WatchAction);
        expect(movie.action?.url).toBe(action.url);

        await expect(engine.documents[movie.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [
                {
                    '@id': movie.url,
                    '@type': 'https://schema.org/Movie',
                    'https://schema.org/name': 'Whisper of the Heart',
                },
                metadataJsonLD(movie as ModelWithUrl<Movie> & ModelWithTimestamps<Movie>),
                {
                    '@id': action.url,
                    '@type': 'https://schema.org/WatchAction',
                    'https://schema.org/object': { '@id': movie.url },
                    'https://schema.org/startTime': {
                        '@value': action.startTime?.toISOString(),
                        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                    },
                },
                metadataJsonLD(action as ModelWithUrl<WatchAction> & ModelWithTimestamps<WatchAction>),
            ],
        });
    });
});
