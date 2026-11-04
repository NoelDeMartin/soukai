import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import { describe, expect, it } from 'vite-plus/test';

import TypeRegistration from './TypeRegistration';

describe('TypeRegistration', () => {
    const Task = defineSchema({
        rdfContexts: { schema: 'https://schema.org/', ical: 'http://www.w3.org/2002/12/cal/ical#' },
        rdfClasses: ['schema:Action', 'ical:Vtodo'],
    });

    bootModels({ Task });

    it('registers models with all their classes', () => {
        const registration = new TypeRegistration({
            forClass: ['https://schema.org/Action', 'http://www.w3.org/2002/12/cal/ical#Vtodo'],
        });

        expect(registration.registers(Task)).toBe(true);
    });

    it('registers models with extra classes', () => {
        const registration = new TypeRegistration({
            forClass: [
                'https://schema.org/Action',
                'http://www.w3.org/2002/12/cal/ical#Vtodo',
                'https://schema.org/Thing',
            ],
        });

        expect(registration.registers(Task)).toBe(true);
    });

    it('does not register models with some of their classes', () => {
        const registration = new TypeRegistration({ forClass: ['https://schema.org/Action'] });

        expect(registration.registers(Task)).toBe(false);
    });
});
