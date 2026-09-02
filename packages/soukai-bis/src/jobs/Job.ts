import { ListenersManager, PromisedValue, round, tap, toError, uuid } from '@noeldemartin/utils';
import type { Listeners } from '@noeldemartin/utils';

import JobCancelledError from 'soukai-bis/errors/JobCancelledError';

import type { JobListener, JobStatus } from './types';

export default abstract class Job<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Listener extends JobListener<any> = JobListener,
    Status extends JobStatus = JobStatus,
> {

    public readonly id: string;
    protected status: Status;
    protected _listeners: ListenersManager<Listener>;
    protected _progress?: number;
    protected _cancelled?: PromisedValue<void>;
    protected _started: PromisedValue<void>;
    protected _completed: PromisedValue<void>;

    constructor() {
        this.id = uuid();
        this.status = this.getInitialStatus();
        this._listeners = new ListenersManager();
        this._started = new PromisedValue();
        this._completed = new PromisedValue();
    }

    public async start(): Promise<void> {
        this.beforeStart();
        this._started.resolve();

        try {
            await this.updateProgress();
            await this.run();
            await this.updateProgress();

            this._completed.resolve();
        } catch (error) {
            if (error instanceof JobCancelledError) {
                await (this._listeners as ListenersManager<JobListener>).emit('onCancelled');

                return;
            }

            throw tap(toError(error), (realError) => {
                this._completed.reject(realError);

                (this._listeners as ListenersManager<JobListener>).emit('onFailed', realError);
            });
        }
    }

    public async cancel(): Promise<void> {
        this._cancelled = new PromisedValue();

        await this._cancelled;
    }

    public get listeners(): Listeners<Listener> {
        return this._listeners;
    }

    public get progress(): number {
        return this._progress ?? 0;
    }

    public get cancelled(): boolean {
        return !!this._cancelled?.isResolved();
    }

    public get started(): Promise<void> {
        return this._started;
    }

    public get completed(): Promise<void> {
        return this._completed;
    }

    protected abstract run(): Promise<void>;

    protected getInitialStatus(): Status {
        return { completed: false } as Status;
    }

    protected beforeStart(): void {
        if (!this._started.isResolved()) {
            return;
        }

        if (this._cancelled) {
            delete this._progress;
            delete this._cancelled;

            return;
        }

        throw new Error('Job already started!');
    }

    protected assertNotCancelled(): void {
        if (!this._cancelled) {
            return;
        }

        this._cancelled.resolve();

        throw new JobCancelledError();
    }

    protected calculateCurrentProgress(status?: JobStatus): number {
        status ??= this.status;

        if (status.completed) {
            return 1;
        }

        if (!status.children || status.children.length === 0) {
            return 0;
        }

        return round(
            status.children.reduce((total, child) => total + this.calculateCurrentProgress(child), 0) /
                status.children.length,
            2,
        );
    }

    protected async updateProgress(update?: (status: Status) => unknown): Promise<void> {
        await update?.(this.status);

        const progress = this.calculateCurrentProgress();

        if (progress === this._progress) {
            return;
        }

        this._progress = progress;

        await (this._listeners as ListenersManager<JobListener>).emit('onUpdated', progress);
    }

}
