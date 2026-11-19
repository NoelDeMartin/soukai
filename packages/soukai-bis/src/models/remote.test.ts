import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setRemoteEngine } from 'soukai-bis/engines/state';
import type Metadata from 'soukai-bis/models/crdts/Metadata';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Project from 'soukai-bis/testing/stubs/Project';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskWithHistory from 'soukai-bis/testing/stubs/TaskWithHistory';
import { describe, expect, it } from 'vite-plus/test';

import { bootModels, requireBootedModel } from './registry';
import { remote } from './remote';

describe('Remote models', () => {
    it('creates remote models', () => {
        // Arrange
        const remoteEngine = new SolidEngine();

        setRemoteEngine(remoteEngine);

        // Act
        const RemoteMovie = remote(Movie);

        // Assert
        expect(RemoteMovie.remote).toBe(true);
        expect(RemoteMovie.modelName).toEqual('RemoteMovie');
        expect(RemoteMovie.defaultContainerUrl).toEqual(Movie.defaultContainerUrl);
        expect(RemoteMovie.requireEngine()).toBe(remoteEngine);
        expect(requireBootedModel('RemoteMovie')).toBe(RemoteMovie);
        expect(new RemoteMovie({ title: 'Spirited Away' })).toBeInstanceOf(Movie);
        expect(Movie.remote).toBe(false);
    });

    it('reuses remote models', () => {
        expect(remote(Movie)).toBe(remote(Movie));
    });

    it('creates new remote models after resetting models', () => {
        // Arrange
        const RemoteMovie = remote(Movie);

        // Act
        bootModels({ Movie }, { reset: true });

        // Assert
        expect(remote(Movie)).not.toBe(RemoteMovie);
        expect(requireBootedModel('RemoteMovie')).toBe(remote(Movie));
    });

    it('returns models that are already remote', () => {
        expect(remote(TypeIndex)).toBe(TypeIndex);
    });

    it('loads same-document relations from the remote engine', async () => {
        // Arrange
        const documentUrl = 'https://alice.example/tasks/learn-solid';

        FakeServer.respondWith(documentUrl, () =>
            FakeResponse.success(`
                @prefix schema: <https://schema.org/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it> a schema:Action ; schema:name "Learn Solid" .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "2020-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "2020-01-01T00:00:00.000Z"^^xsd:dateTime .

                <#it-operation-1>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:property schema:name ;
                    crdt:value "Learn Solid" ;
                    crdt:date "2020-01-01T00:00:00.000Z"^^xsd:dateTime .
            `),
        );

        const task = await remote(TaskWithHistory).findOrFail(`${documentUrl}#it`);

        // Act
        const operations = await task.loadRelation('operations');
        const metadata = (await task.loadRelation('metadata')) as Metadata | null;

        // Assert
        expect(operations).toHaveLength(1);
        expect(metadata?.url).toEqual(`${documentUrl}#it-metadata`);
    });

    it('uses remote classes for relations', async () => {
        // Arrange
        const taskDocumentUrl = 'https://alice.example/tasks/learn-solid';
        const projectDocumentUrl = 'https://alice.example/projects/solid';

        FakeServer.respondWith(taskDocumentUrl, () =>
            FakeResponse.success(`
                @prefix schema: <https://schema.org/> .

                <#it> a schema:Action ; schema:name "Learn Solid" ; schema:object <${projectDocumentUrl}#it> .
            `),
        );
        FakeServer.respondWith(projectDocumentUrl, () =>
            FakeResponse.success(`
                @prefix schema: <https://schema.org/> .

                <#it> a schema:Project ; schema:name "Solid" .
            `),
        );

        const task = await remote(Task).findOrFail(`${taskDocumentUrl}#it`);

        // Act
        const project = await task.loadRelation('project');

        // Assert
        expect(project).toBeInstanceOf(remote(Project));
        expect(project?.name).toEqual('Solid');
    });
});
