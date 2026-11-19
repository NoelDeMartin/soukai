import { turtleToQuads } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';
import { HTTP_SCHEMA } from 'soukai-bis/testing/constants';

export function keywordsDocumentQuads(documentUrl: string): Promise<Quad[]> {
    return turtleToQuads(
        `
            @prefix schema: <https://schema.org/> .
            @prefix http: <${HTTP_SCHEMA}> .

            <#it>
                schema:keywords "anime", "comedy" ;
                http:keywords "drama" ;
                schema:actor <#alice> .

            <#other> schema:keywords "anime" .
        `,
        { baseIRI: documentUrl },
    );
}
