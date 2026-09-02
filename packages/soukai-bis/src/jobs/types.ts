export interface JobListener<TResult = void, TCancelledResult = void> {
    onUpdated?(progress: number): unknown;
    onFinished?(result: TResult): unknown;
    onCancelled?(result: TCancelledResult): unknown;
    onFailed?(error: Error): unknown;
}

export interface JobStatus {
    completed: boolean;
    children?: JobStatus[];
}
