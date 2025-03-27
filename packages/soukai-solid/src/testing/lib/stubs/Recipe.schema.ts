import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { schema: 'https://schema.org/' },
    rdfsClass: 'Recipe',
    fields: {
        name: {
            type: FieldType.String,
            required: true,
        },
        ingredients: {
            type: FieldType.Array,
            rdfProperty: 'recipeIngredient',
            items: FieldType.String,
        },
        instructionsStepUrls: {
            type: FieldType.Array,
            rdfProperty: 'recipeInstructions',
            items: FieldType.Key,
        },
    },
});
