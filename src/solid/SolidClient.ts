import Resource, { ResourceProperty } from '@/solid/Resource';

import Arr from '@/utils/Arr';
import RDF, { IRI } from '@/utils/RDF';
import Url from '@/utils/Url';

interface RequestOptions {
    headers?: object;
    method?: string;
    body?: string;
}

export type Fetch = (url: string, options?: RequestOptions) => Promise<Response>;

export default class SolidClient {

    private fetch: Fetch;

    constructor(fetch: Fetch) {
        this.fetch = fetch;
    }

    public async createResource(
        parentUrl: string,
        url: string | null = null,
        properties: ResourceProperty[] = [],
    ): Promise<Resource> {
        const turtleData = properties
            .map(property => property.toTurtle(url || '') + ' .')
            .join("\n");

        if (this.containsType(properties, IRI('ldp:Container')))
            return this.createLDPContainer(parentUrl, url, turtleData);

        if (this.containsType(properties, IRI('ldp:Resource')))
            return this.createLDPResource(parentUrl, url, turtleData);

        return this.createEmbeddedResource(parentUrl, url, turtleData);
    }

    public async getResource(url: string): Promise<Resource | null> {
        const response = await this.fetch(url, {
            headers: { 'Accept': 'text/turtle' },
        });

        if (response.status !== 200) {
            return null;
        }

        const data = await response.text();

        return RDF.parseTurtle(url, data);
    }

    public async getResources(containerUrl: string, types: string[] = []): Promise<Resource[]> {
        try {
            const resources = await this.getResourcesFromParent(
                containerUrl,
                types.indexOf(IRI('ldp:Container')) !== -1,
            );

            return resources.filter(resource => {
                for (const type of types) {
                    if (!resource.is(type)) {
                        return false;
                    }
                }

                return true;
            });
        } catch (e) {
            // Due to an existing bug, empty containers return 404
            // see: https://github.com/solid/node-solid-server/issues/900
            console.error(e);

            return [];
        }
    }

    public async updateResource(
        url: string,
        updatedProperties: ResourceProperty[],
        removedProperties: string[],
    ): Promise<void> {
        if (updatedProperties.length + removedProperties.length === 0) {
            return;
        }

        const resource = await this.getResource(url);

        if (resource === null) {
            throw new Error(
                `Error updating resource at ${url}, resource wasn't found`,
            );
        }

        // We need to remove the previous value of updated properties or else they'll be duplicated
        removedProperties.push(
            ...updatedProperties
                .map(property => (property.predicate !== 'a') ? property.predicate.iri : null)
                .filter(property => property !== null)
                .filter((property: string) => resource.properties.indexOf(property) !== -1) as string[],
        );

        if (resource.is(IRI('ldp:Container'))) {
            await this.updateContainerResource(resource, updatedProperties, removedProperties);

            return;
        }

        const where = removedProperties
            .map((property, i) => `<${url}> <${property}> ?d${i} .`)
            .join('\n');

        const inserts = updatedProperties
            .map(property => property.toTurtle(url) + ' .')
            .join('\n');

        const deletes = removedProperties
            .map((property, i) => `<${url}> <${property}> ?d${i} .`)
            .join('\n');

        const operations = [
            `solid:patches <${url}>`,
            `solid:inserts { ${inserts} }`,
            `solid:where { ${where} }`,
            `solid:deletes { ${deletes} }`,
        ]
            .filter(part => part !== null)
            .join(';');

        const response = await this.fetch(
            url,
            {
                method: 'PATCH',
                body: `
                    @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                    <> ${operations} .
                `,
                headers: {
                    'Content-Type': 'text/n3',
                },
            },
        );

        if (response.status !== 200) {
            throw new Error(
                `Error updating resource at ${url}, returned status code ${response.status}`,
            );
        }
    }

    public async deleteResource(url: string): Promise<void> {
        const resource = await this.getResource(url);

        if (resource === null) {
            return;
        }

        if (resource.is(IRI('ldp:Container'))) {
            const resources = (await Promise.all([
                this.getResources(url, [IRI('ldp:Container')]),
                this.getResources(url),
            ]))
                .reduce((resources, allResources) => {
                    allResources.push(...resources);

                    return allResources;
                }, []);

            await Promise.all(resources.map(resource => this.deleteResource(resource.url)));
        }

        await this.fetch(url, { method: 'DELETE' });
    }

    public async resourceExists(url: string): Promise<boolean> {
        const response = await this.fetch(url, {
            headers: { 'Accept': 'text/turtle' },
        });

        if (response.status === 200) {
            const data = await response.text();
            const resource = await RDF.parseTurtle(url, data);

            return !resource.isEmpty();
        } else if (response.status === 404) {
            return false;
        } else {
            throw new Error(
                `Couldn't determine if resource at ${url} exists, got ${response.status} response`
            );
        }
    }

    private async createLDPContainer(
        parentUrl: string,
        url: string | null,
        data: string,
    ): Promise<Resource> {
        if (!url) {
            const response = await this.fetch(
                parentUrl,
                {
                    headers: {
                        'Content-Type': 'text/turtle',
                        'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                    },
                    method: 'POST',
                    body: data,
                },
            );

            return RDF.parseTurtle(Url.resolve(parentUrl, response.headers.get('Location') || ''), data);
        }

        if (!url.startsWith(parentUrl))
            throw new Error('Explicit resource url should start with the parent url');

        if (!url.endsWith('/'))
            throw new Error(`Container urls must end with a trailing slash, given ${url}`);

        await this.fetch(
            parentUrl,
            {
                method: 'POST',
                body: data,
                headers: {
                    'Content-Type': 'text/turtle',
                    'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                    'Slug': Url.filename(url.substr(0, url.length - 1)),
                },
            },
        );

        return RDF.parseTurtle(url, data);
    }

    private async createLDPResource(
        parentUrl: string,
        url: string | null,
        data: string,
    ): Promise<Resource> {
        if (!url) {
            const response = await this.fetch(parentUrl, {
                headers: { 'Content-Type': 'text/turtle' },
                method: 'POST',
                body: data,
            });

            return RDF.parseTurtle(Url.resolve(parentUrl, response.headers.get('Location') || ''), data);
        }

        if (!url.startsWith(parentUrl))
            throw new Error('Explicit resource url should start with the parent url');

        await this.fetch(url, {
            headers: { 'Content-Type': 'text/turtle' },
            method: 'PUT',
            body: data,
        });

        return RDF.parseTurtle(url, data);
    }

    private async createEmbeddedResource(
        parentUrl: string,
        url: string | null,
        data: string,
    ): Promise<Resource> {
        if (!url || !url.startsWith(parentUrl))
            throw new Error('Embedded resources require an explicit url starting with the parent url');

        if (!await this.resourceExists(parentUrl))
            throw new Error(`Cannot create a embedded resource at ${parentUrl} because it doesn't exist`);

        await this.fetch(
            parentUrl,
            {
                method: 'PATCH',
                body: `
                    @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                    <>
                        solid:patches <${parentUrl}> ;
                        solid:inserts { ${data} } .
                `,
                headers: {
                    'Content-Type': 'text/n3',
                },
            },
        );

        return RDF.parseTurtle(url, data);
    }

    private async getResourcesFromParent(containerUrl: string, includeChildContainers: boolean): Promise<Resource[]> {
        if (!containerUrl.endsWith('/'))
            return this.getEmbeddedResources(containerUrl);

        // Globbing only returns non-container resources
        if (!includeChildContainers)
            return this.getLDPResourcesUsingGlobbing(containerUrl);

        return this.getLDPContainers(containerUrl, true);
    }

    private async getEmbeddedResources(containerUrl: string): Promise<Resource[]> {
        const data = await this
            .fetch(containerUrl, { headers: { 'Accept': 'text/turtle' } })
            .then(res => res.text());

        const containerResource = await RDF.parseTurtle(containerUrl, data);

        return Arr
            .unique(containerResource.sourceStatements.map(statement => statement.subject.value))
            .map(url => new Resource(url, containerResource.sourceStatements));
    }

    private async getLDPContainers(containerUrl: string, onlyContainers: boolean): Promise<Resource[]> {
        const containerResource =
            await this
                .fetch(containerUrl, { headers: { 'Accept': 'text/turtle' } })
                .then(res => res.text())
                .then(data => RDF.parseTurtle(containerUrl, data));

        const urls = containerResource.getPropertyValue('ldp:contains') || [];

        const resources = await Promise.all(
            Arr
                .create(urls as string)
                .map(async url => {
                    const resource = new Resource(url, containerResource.sourceStatements);

                    // Requests only return ldp types for unexpanded resources, so we can only filter
                    // by containers or plain resources
                    if (onlyContainers && !resource.is(IRI('ldp:Container'))) {
                        return null;
                    }

                    return await this.getResource(resource.url);
                }),
        );

        return resources.filter(resource => resource !== null) as Resource[];
    }

    private async getLDPResourcesUsingGlobbing(containerUrl: string): Promise<Resource[]> {
        const data = await this
            .fetch(containerUrl + '*', { headers: { 'Accept': 'text/turtle' } })
            .then(res => res.text());

        const containerResource = await RDF.parseTurtle(containerUrl, data);

        return containerResource.sourceStatements
            .filter(statement => statement.predicate.value === IRI('rdf:type') && statement.object.value === IRI('ldp:Resource'))
            .map(statement => new Resource(statement.subject.value, containerResource.sourceStatements));
    }

    private async updateContainerResource(
        resource: Resource,
        updatedProperties: ResourceProperty[],
        removedProperties: string[],
    ): Promise<void> {
        // TODO this may change in future versions of node-solid-server
        // https://github.com/solid/node-solid-server/issues/1040
        const url = resource.url;
        const properties = resource.getProperties()
            .filter(property => {
                const predicate = property.getPredicateIRI();

                return predicate !== RDF.resolveIRI('ldp:contains')
                    && predicate !== 'http://www.w3.org/ns/posix/stat#mtime'
                    && predicate !== 'http://www.w3.org/ns/posix/stat#size'
                    && !removedProperties.find(removedProperty => removedProperty === predicate);
            });

        properties.push(...updatedProperties);

        const response = await this.fetch(
            url + '.meta',
            {
                method: 'PUT',
                body: properties
                    .map(property => property.toTurtle(url || '') + ' .')
                    .join("\n"),
                headers: {
                    'Content-Type': 'text/turtle',
                },
            }
        );

        if (response.status !== 201) {
            throw new Error(
                `Error updating container resource at ${resource.url}, returned status code ${response.status}`,
            );
        }
    }

    private containsType(properties: ResourceProperty[], type: string): boolean {
        return !!properties.find(property => property.isType(type));
    }

}
