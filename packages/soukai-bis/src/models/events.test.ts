import { emitModelClassEvent, emitModelInstanceEvent } from 'soukai-bis/models/events';
import Post from 'soukai-bis/testing/stubs/Post';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import User from 'soukai-bis/testing/stubs/User';
import { describe, expect, it, vi } from 'vite-plus/test';

describe('Events', () => {
    describe('Instance events', () => {
        it('notifies static listeners for every instance', async () => {
            // Arrange
            const events: string[] = [];

            Post.on('created', ({ model }) => events.push(`created ${model.title}`));
            Post.on('updated', ({ model }) => events.push(`updated ${model.title}`));
            Post.on('saved', ({ model }) => events.push(`saved ${model.title}`));
            Post.on('deleted', ({ model }) => events.push(`deleted ${model.title}`));
            Post.on('modified', ({ model, field }) => events.push(`modified ${model.title} (${field})`));

            // Act
            const first = await Post.create({ title: 'First' });
            const second = await Post.create({ title: 'Second' });

            await first.update({ title: 'First updated' });
            await second.delete();

            // Assert
            expect(events).toEqual([
                'modified First (url)',
                'created First',
                'saved First',
                'modified Second (url)',
                'created Second',
                'saved Second',
                'modified First updated (title)',
                'updated First updated',
                'saved First updated',
                'deleted Second',
            ]);
        });

        it('notifies instance listeners only for their instance', async () => {
            // Arrange
            const first = await Post.create({ title: 'First' });
            const second = await Post.create({ title: 'Second' });
            const updatedListener = vi.fn();
            const modifiedListener = vi.fn();

            first.on('updated', updatedListener);
            first.on('modified', modifiedListener);

            // Act
            await second.update({ title: 'Second updated' });
            await first.update({ title: 'First updated' });

            // Assert
            expect(updatedListener).toHaveBeenCalledOnce();
            expect(updatedListener).toHaveBeenCalledWith({ model: first });
            expect(modifiedListener).toHaveBeenCalledOnce();
            expect(modifiedListener).toHaveBeenCalledWith({ model: first, field: 'title' });
        });

        it('passes the same payload to static and instance listeners', async () => {
            // Arrange
            const user = await User.create({ name: 'Alice' });
            const post = await Post.create({ title: 'Hello World' });
            const staticListener = vi.fn();
            const instanceListener = vi.fn();

            User.on('relation-loaded', staticListener);
            user.on('relation-loaded', instanceListener);

            // Act
            await user.setRelationModels('posts', [post]);

            // Assert
            const payload = { model: user, relation: user.relatedPosts };

            expect(user.posts).toEqual([post]);
            expect(staticListener).toHaveBeenCalledExactlyOnceWith(payload);
            expect(instanceListener).toHaveBeenCalledExactlyOnceWith(payload);
        });

        it('listens once', async () => {
            // Arrange
            const post = await Post.create({ title: 'Once' });
            const staticListener = vi.fn();
            const instanceListener = vi.fn();

            Post.once('updated', staticListener);
            post.once('updated', instanceListener);

            // Act
            await post.update({ title: 'Once updated' });
            await post.update({ title: 'Once updated again' });

            // Assert
            expect(staticListener).toHaveBeenCalledExactlyOnceWith({ model: post });
            expect(instanceListener).toHaveBeenCalledExactlyOnceWith({ model: post });
        });

        it('keeps instance once listeners until their instance emits', async () => {
            // Arrange
            const first = await Post.create({ title: 'First' });
            const second = await Post.create({ title: 'Second' });
            const listener = vi.fn();

            first.once('updated', listener);

            // Act
            await second.update({ title: 'Second updated' });
            await first.update({ title: 'First updated' });

            // Assert
            expect(listener).toHaveBeenCalledExactlyOnceWith({ model: first });
        });

        it('stops listening', async () => {
            // Arrange
            const post = await Post.create({ title: 'Stop' });
            const staticListener = vi.fn();
            const instanceListener = vi.fn();
            const stopStatic = Post.on('updated', staticListener);
            const stopInstance = post.on('updated', instanceListener);

            // Act
            stopStatic();
            stopInstance();

            await post.update({ title: 'Stop updated' });

            // Assert
            expect(staticListener).not.toHaveBeenCalled();
            expect(instanceListener).not.toHaveBeenCalled();
        });

        it('turns off static listeners from all events', async () => {
            // Arrange
            const post = await Post.create({ title: 'Off' });
            const listener = vi.fn();
            const otherListener = vi.fn();

            Post.on('updated', listener);
            Post.on('updated', listener);
            Post.on('saved', listener);
            Post.once('modified', listener);
            Post.on('updated', otherListener);

            // Act
            Post.off('*', listener);

            await post.update({ title: 'Off updated' });

            // Assert
            expect(listener).not.toHaveBeenCalled();
            expect(otherListener).toHaveBeenCalledExactlyOnceWith({ model: post });
        });

        it('turns off instance listeners from all events', async () => {
            // Arrange
            const first = await Post.create({ title: 'First' });
            const second = await Post.create({ title: 'Second' });
            const listener = vi.fn();

            Post.on('updated', listener);
            first.on('updated', listener);
            first.once('saved', listener);
            second.on('updated', listener);

            // Act
            first.off('*', listener);

            await first.update({ title: 'First updated' });
            await second.update({ title: 'Second updated' });

            // Assert
            expect(listener).toHaveBeenCalledTimes(3);
            expect(listener).toHaveBeenNthCalledWith(1, { model: first });
            expect(listener).toHaveBeenNthCalledWith(2, { model: second });
            expect(listener).toHaveBeenNthCalledWith(3, { model: second });
        });

        it('turns off static listeners for a given event', async () => {
            // Arrange
            const post = await Post.create({ title: 'Off' });
            const listener = vi.fn();

            Post.on('updated', listener);
            Post.once('updated', listener);
            Post.on('saved', listener);

            // Act
            Post.off('updated', listener);

            await post.update({ title: 'Off updated' });

            // Assert
            expect(listener).toHaveBeenCalledExactlyOnceWith({ model: post });
        });

        it('turns off instance listeners for a given event', async () => {
            // Arrange
            const post = await Post.create({ title: 'Off' });
            const listener = vi.fn();

            Post.on('updated', listener);
            post.on('updated', listener);
            post.on('saved', listener);

            // Act
            post.off('updated', listener);

            await post.update({ title: 'Off updated' });

            // Assert
            expect(listener).toHaveBeenCalledTimes(2);
            expect(listener).toHaveBeenNthCalledWith(1, { model: post });
            expect(listener).toHaveBeenNthCalledWith(2, { model: post });
        });

        it('cannot turn off class events from instances', () => {
            // Arrange
            const task = new Task({ name: 'Task' });

            // Act & Assert
            // @ts-expect-error Class events are only emitted by model classes.
            task.off('schema-updated', () => null);
        });

        it('ignores listeners that are not registered', async () => {
            // Arrange
            const post = await Post.create({ title: 'Unknown' });
            const listener = vi.fn();

            Post.on('updated', listener);

            // Act
            Post.off('*', vi.fn());
            post.off('*', listener);
            User.off('*', listener);

            await post.update({ title: 'Unknown updated' });

            // Assert
            expect(listener).toHaveBeenCalledExactlyOnceWith({ model: post });
        });

        it('does not notify listeners of other classes', async () => {
            // Arrange
            const listener = vi.fn();

            User.on('created', listener);

            // Act
            await Post.create({ title: 'Not a user' });

            // Assert
            expect(listener).not.toHaveBeenCalled();
        });

        it('emits events manually', async () => {
            // Arrange
            const post = await Post.create({ title: 'Manual' });
            const staticListener = vi.fn();
            const instanceListener = vi.fn();

            Post.on('modified', staticListener);
            post.on('modified', instanceListener);

            // Act
            await emitModelInstanceEvent(post, 'modified', { field: 'title' });

            // Assert
            expect(staticListener).toHaveBeenCalledExactlyOnceWith({ model: post, field: 'title' });
            expect(instanceListener).toHaveBeenCalledExactlyOnceWith({ model: post, field: 'title' });
        });

        it('waits for async listeners', async () => {
            // Arrange
            const calls: string[] = [];
            const post = await Post.create({ title: 'Async listeners' });
            const asyncListener = (name: string) => async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));

                calls.push(name);
            };

            Post.once('updated', asyncListener('static-once'));
            Post.on('updated', asyncListener('static-on'));
            post.on('updated', asyncListener('instance-on'));
            post.once('updated', asyncListener('instance-once'));

            // Act
            await post.update({ title: 'Async listeners updated' });

            // Assert
            expect(calls.sort()).toEqual(['instance-on', 'instance-once', 'static-on', 'static-once']);
        });
    });

    describe('Class events', () => {
        it('notifies static listeners', async () => {
            // Arrange
            const listener = vi.fn();
            const onceListener = vi.fn();

            Task.on('schema-updated', listener);
            Task.once('schema-updated', onceListener);

            // Act
            await Task.updateSchema(TaskICalSchema);
            await Task.updateSchema(TaskICalSchema);

            // Assert
            expect(listener).toHaveBeenCalledTimes(2);
            expect(listener).toHaveBeenCalledWith({ modelClass: Task, schema: TaskICalSchema });
            expect(onceListener).toHaveBeenCalledExactlyOnceWith({ modelClass: Task, schema: TaskICalSchema });
        });

        it('emits events manually', async () => {
            // Arrange
            const listener = vi.fn();

            Task.on('schema-updated', listener);

            // Act
            await emitModelClassEvent(Task, 'schema-updated', { schema: TaskICalSchema });

            // Assert
            expect(listener).toHaveBeenCalledExactlyOnceWith({ modelClass: Task, schema: TaskICalSchema });
        });

        it('turns off listeners', async () => {
            // Arrange
            const listener = vi.fn();

            Task.on('schema-updated', listener);
            Task.once('schema-updated', listener);

            // Act
            Task.off('*', listener);

            await Task.updateSchema(TaskICalSchema);

            // Assert
            expect(listener).not.toHaveBeenCalled();
        });

        it('waits for async listeners', async () => {
            // Arrange
            let finished = false;

            Task.on('schema-updated', async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));

                finished = true;
            });

            // Act
            await Task.updateSchema(TaskICalSchema);

            // Assert
            expect(finished).toBe(true);
        });

        it('cannot be listened to from instances', () => {
            // Arrange
            const task = new Task({ name: 'Task' });

            // Act & Assert
            // @ts-expect-error Class events are only emitted by model classes.
            task.on('schema-updated', () => null);
        });
    });
});
