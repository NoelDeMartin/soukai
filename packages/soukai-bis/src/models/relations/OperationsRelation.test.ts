import { beforeEach, describe, expect, it } from 'vitest';
import { FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';

import User from 'soukai-bis/testing/stubs/User';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { defineSchema } from 'soukai-bis/models/schema';
import { bootModels } from 'soukai-bis/models/registry';
import { setEngine } from 'soukai-bis/engines/state';

describe('OperationsRelation', () => {

    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('loads document operations', async () => {
        // Arrange
        class UserWithHistory extends defineSchema(User, { history: true }) {}

        bootModels({ UserWithHistory });

        const documentUrl = fakeDocumentUrl();

        FakeServer.respond(
            documentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a foaf:Person ;
                    foaf:name "Alice Cooper" .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "2021-01-03T00:00:00.000Z"^^xsd:dateTime .

                <#it-operation-1>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:property foaf:name ;
                    crdt:value "Alice Cooper" ;
                    crdt:date "2026-07-10T00:00:00.000Z"^^xsd:dateTime .

                <#it-operation-2>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:property foaf:givenName ;
                    crdt:value "Alice" ;
                    crdt:date "2026-07-10T00:00:00.000Z"^^xsd:dateTime .

                <#it-operation-3>
                    a crdt:UnsetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:property foaf:givenName ;
                    crdt:value "Alice" ;
                    crdt:date "2026-07-11T00:00:00.000Z"^^xsd:dateTime .
            `,
        );

        // Act
        const user = await UserWithHistory.findOrFail(`${documentUrl}#it`);

        // Assert
        expect(user.operations).toHaveLength(3);
    });

});
