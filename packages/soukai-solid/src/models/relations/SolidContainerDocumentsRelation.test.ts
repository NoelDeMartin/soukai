import { beforeEach, describe, expect, it } from 'vitest';
import { FakeServer, fakeContainerUrl } from '@noeldemartin/testing';
import { setEngine } from 'soukai';

import { SolidContainer } from 'soukai-solid/models';
import { SolidEngine } from 'soukai-solid/engines/SolidEngine';

describe('SolidContainerDocumentsRelation', () => {

    beforeEach(() => setEngine(new SolidEngine(FakeServer.fetch)));

    it('Ignores non-document resources', async () => {
        // Arrange
        const url = fakeContainerUrl();

        FakeServer.respondOnce(
            url,
            `
                @prefix dc: <http://purl.org/dc/terms/>.
                @prefix pim: <http://www.w3.org/ns/pim/space#>.
                @prefix ldp: <http://www.w3.org/ns/ldp#>.
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
                @prefix turtle: <http://www.w3.org/ns/iana/media-types/text/turtle#>.
                @prefix jpeg: <http://www.w3.org/ns/iana/media-types/image/jpeg#>.
                @prefix png: <http://www.w3.org/ns/iana/media-types/image/png#>.
                @prefix jsonld: <http://www.w3.org/ns/iana/media-types/application/ld+json#>.
                @prefix rdf: <http://www.w3.org/ns/iana/media-types/application/rdf+xml#>.

                <>
                    a pim:Storage, ldp:Container, ldp:BasicContainer, ldp:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime;
                    ldp:contains
                        <turtle-1>,
                        <turtle-2>,
                        <image-jpeg>,
                        <image-png>,
                        <jsonld>,
                        <rdf>,
                        <container/>.

                <turtle-1>
                    a ldp:Resource, turtle:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.

                <turtle-2>
                    a ldp:Resource, turtle:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.

                <image-jpeg>
                    a ldp:Resource, jpeg:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.

                <image-png>
                    a ldp:Resource, png:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.

                <jsonld>
                    a ldp:Resource, jsonld:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.

                <rdf>
                    a ldp:Resource, rdf:Resource;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.

                <container/>
                    a ldp:Resource, ldp:Container, ldp:BasicContainer;
                    dc:modified "2022-12-26T09:22:26.000Z"^^xsd:dateTime.
            `,
        );

        // Act
        const container = (await SolidContainer.find(url)) as SolidContainer;

        await container.loadRelation('documents');

        // Assert
        expect(container.resourceUrls).toHaveLength(7);
        expect(container.documents).toHaveLength(5);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
    });

});
