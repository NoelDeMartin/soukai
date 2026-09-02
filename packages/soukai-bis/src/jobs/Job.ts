import { ListenersManager, PromisedValue, round, tap, toError, uuid } from '@noeldemartin/utils';
import type { Listeners } from '@noeldemartin/utils';

import JobCancelledError from 'soukai-bis/errors/JobCancelledError';

import type { JobListener, JobStatus } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListenersManager = ListenersManager<JobListener<any, any>>;

export default abstract class Job<
    Result = any, // eslint-disable-line @typescript-eslint/no-explicit-any
    PartialResult = any, // eslint-disable-line @typescript-eslint/no-explicit-any
    Status extends JobStatus = JobStatus,
    Listener extends JobListener<Result, PartialResult> = JobListener<Result, PartialResult>,
> {

    public readonly id: string;
    protected status: Status;
    protected _listeners: ListenersManager<Listener>;
    protected _progress?: number;
    protected _cancelled?: PromisedValue<PartialResult>;
    protected _started: PromisedValue<void>;
    protected _completed: PromisedValue<Result>;

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

            const result = await this.run();

            await this.updateProgress();

            this._completed.resolve(result);

            await (this._listeners as AnyListenersManager).emit('onFinished', result);
        } catch (error) {
            if (error instanceof JobCancelledError) {
                await (this._listeners as AnyListenersManager).emit('onCancelled', error.result);

                return;
            }

            throw tap(toError(error), (realError) => {
                this._completed.reject(realError);

                (this._listeners as AnyListenersManager).emit('onFailed', realError);
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

    public get completed(): Promise<Result> {
        return this._completed;
    }

    protected abstract run(): Promise<Result>;

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

    protected assertNotCancelled(result: PartialResult): void {
        if (!this._cancelled) {
            return;
        }

        this._cancelled.resolve(result);

        throw new JobCancelledError(result);
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

        await (this._listeners as AnyListenersManager).emit('onUpdated', progress);
    }

}
