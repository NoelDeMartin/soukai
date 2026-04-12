import type Job from './Job';

export async function dispatch(job: Job): Promise<void> {
    await job.start();
}
