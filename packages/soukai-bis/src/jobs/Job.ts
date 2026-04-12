import { ListenersManager, PromisedValue, round, tap, toError } from '@noeldemartin/utils';
import type { Listeners } from '@noeldemartin/utils';

import JobCancelledError from 'soukai-bis/errors/JobCancelledError';

import type { JobListener, JobStatus } from './types';

export default abstract class Job<
    Listener extends JobListener = JobListener,
    Status extends JobStatus = JobStatus,
    SerializedStatus extends JobStatus = JobStatus,
> {

    protected status: Status;
    protected _listeners: ListenersManager<Listener>;
    protected _progress?: number;
    protected _cancelled?: PromisedValue<void>;
    protected _started: PromisedValue<void>;
    protected _completed: PromisedValue<void>;

    constructor() {
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
                return;
            }

            throw tap(toError(error), (realError) => {
                this._completed.reject(realError);
            });
        }
    }

    public async cancel(): Promise<void> {
        this._cancelled = new PromisedValue();

        await this._cancelled;
    }

    public serialize(): SerializedStatus {
        return this.serializeStatus(this.status);
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

    protected serializeStatus(status: Status): SerializedStatus {
        return { ...status } as unknown as SerializedStatus;
    }

}
