import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { acl: 'http://www.w3.org/ns/auth/acl#' },
    rdfsClass: 'Authorization',
    timestamps: false,
    fields: {
        agents: {
            rdfProperty: 'agent',
            type: FieldType.Array,
            items: FieldType.Key,
        },
        agentClasses: {
            rdfProperty: 'agentClass',
            type: FieldType.Array,
            items: FieldType.Key,
        },
        agentGroups: {
            rdfProperty: 'agentGroup',
            type: FieldType.Array,
            items: FieldType.Key,
        },
        accessTo: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
        accessToClasses: {
            rdfProperty: 'accessToClass',
            type: FieldType.Array,
            items: FieldType.Key,
        },
        default: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
        modes: {
            rdfProperty: 'mode',
            type: FieldType.Array,
            items: FieldType.Key,
        },
    },
});
