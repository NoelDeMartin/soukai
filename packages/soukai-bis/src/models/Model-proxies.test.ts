import { required } from '@noeldemartin/utils';
import Project from 'soukai-bis/testing/stubs/Project';
import { describe, expect, it, vi } from 'vite-plus/test';

describe('Model proxies', () => {
    it('collects document models without duplicates', async () => {
        // Arrange
        const project = await findProjectWithTask();

        // Act
        const documentModels = wrapInProxy(project).getDocumentModels();

        // Assert
        expect(documentModels).toHaveLength(4); // project, task, and their metadata
        expect(new Set(documentModels).size).toBe(documentModels.length);
        expect(documentModels).toContain(project);
        expect(documentModels).toContain(project.tasks?.[0]);
    });

    it('records history operations once', async () => {
        // Arrange
        const project = await findProjectWithTask();

        // Act
        vi.advanceTimersByTime(1);
        await wrapInProxy(project).update({ name: 'Proxies (fixed)' });

        // Assert
        const freshProject = await Project.findOrFail(project.url);
        const operations = await freshProject.loadRelation('operations');

        expect(freshProject.name).toBe('Proxies (fixed)');
        expect(operations).toHaveLength(2);
    });

    it('deletes instances', async () => {
        // Arrange
        const project = await findProjectWithTask();

        // Act
        await wrapInProxy(project).delete();

        // Assert
        expect(project.exists()).toBe(false);
        expect(await Project.find(project.url)).toBeNull();
    });

    it('emits events once with the unwrapped instance', async () => {
        // Arrange
        const project = await findProjectWithTask();
        const projectProxy = wrapInProxy(project);
        const classListener = vi.fn();
        const instanceListener = vi.fn();
        const proxyListener = vi.fn();

        Project.on('updated', classListener);
        project.on('updated', instanceListener);
        projectProxy.on('updated', proxyListener);

        // Act
        vi.advanceTimersByTime(1);
        await projectProxy.update({ name: 'Proxies (fixed)' });

        // Assert
        expect(classListener).toHaveBeenCalledTimes(1);
        expect(classListener).toHaveBeenCalledWith({ model: project });
        expect(instanceListener).toHaveBeenCalledWith({ model: project });
        expect(instanceListener).toHaveBeenCalledTimes(1);
        expect(proxyListener).toHaveBeenCalledTimes(1);
    });

    it('sets relation models without duplicates', async () => {
        // Arrange
        const project = await findProjectWithTask();
        const task = required(project.tasks?.[0]);

        // Act
        await project.setRelationModels('tasks', [wrapInProxy(task)]);

        // Assert
        expect(project.tasks).toHaveLength(1);
        expect(project.tasks?.[0]).toBe(task);
        expect(task.getRelation('project').related).toBe(project);
    });

    it('attaches and detaches related models', async () => {
        // Arrange
        const project = await findProjectWithTask();
        const task = required(project.tasks?.[0]);

        // Act
        project.relatedTasks.attach(wrapInProxy(task));

        const tasksAfterAttach = project.tasks?.slice();
        const detached = project.relatedTasks.detach(wrapInProxy(task));

        // Assert
        expect(tasksAfterAttach).toEqual([task]);
        expect(detached).toEqual([task]);
        expect(project.tasks).toHaveLength(0);
    });

    async function findProjectWithTask() {
        const project = new Project({ name: 'Proxies' });

        project.relatedTasks.attach({ name: 'Fix proxies' });

        const { url } = await project.save();

        return Project.findOrFail(url);
    }

    function wrapInProxy<T extends object>(target: T): T {
        return new Proxy(target, {});
    }
});
