export interface JobListener {
    onUpdated?(progress: number): unknown;
}

export interface JobStatus {
    completed: boolean;
    children?: JobStatus[];
}
