// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface JobListener<Result = any, PartialResult = any> {
    onUpdated?(progress: number): unknown;
    onFinished?(result: Result): unknown;
    onCancelled?(result: PartialResult): unknown;
    onFailed?(error: Error): unknown;
}

export interface JobStatus {
    completed: boolean;
    children?: JobStatus[];
}
