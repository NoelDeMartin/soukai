import { emitModelClassEvent } from 'soukai-bis/models/events';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import { describe, expect, it, vi } from 'vite-plus/test';

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
