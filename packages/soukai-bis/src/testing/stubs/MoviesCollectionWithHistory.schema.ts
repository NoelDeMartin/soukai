import { defineSchema } from 'soukai-bis';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';

export default defineSchema(MoviesCollection, {
    history: true,
    timestamps: true,
});
