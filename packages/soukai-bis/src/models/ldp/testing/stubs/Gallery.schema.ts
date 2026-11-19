import { arraySorted } from '@noeldemartin/utils';
import { defineSchema, isContainedBy } from 'soukai-bis';
import { InvalidationStrategies } from 'soukai-bis/models/computed-attributes/ComputedAttribute';
import { loaded } from 'soukai-bis/models/computed-attributes/helpers';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'ImageGallery',
    fields: { name: string() },
    relations: { container: isContainedBy('Container') },
    computed: {
        imageUrls: {
            invalidationStrategy: InvalidationStrategies.Container,
            compute: (gallery): string[] => arraySorted(loaded(gallery, 'container')?.fileUrls ?? []),
        },
    },
});
