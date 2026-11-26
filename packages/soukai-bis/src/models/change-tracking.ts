import { getAsyncContext, runWithAsyncContext } from 'soukai-bis/lib/context';

export function runWithChangeTrackingDisabled<T>(operation: () => T): T {
    return runWithAsyncContext({ changeTrackingDisabled: true }, operation);
}

export function isChangeTrackingDisabled(): boolean {
    return getAsyncContext().changeTrackingDisabled ?? false;
}
