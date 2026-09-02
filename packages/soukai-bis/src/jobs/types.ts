export interface JobListener<T = void> {
    onUpdated?(progress: number): unknown;
    onFinished?(result: T): unknown;
    onCancelled?(): unknown;
}

export interface JobStatus {
    completed: boolean;
    children?: JobStatus[];
}
