import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { schema: 'https://schema.org/' },
    rdfsClass: 'HowToStep',
    fields: {
        text: {
            type: FieldType.String,
            required: true,
        },
        position: {
            type: FieldType.Number,
            required: true,
        },
    },
});
