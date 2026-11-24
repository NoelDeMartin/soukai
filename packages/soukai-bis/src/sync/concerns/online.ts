export function getDefaultOnlineStatus(): boolean {
    const onLine = globalThis.navigator?.onLine;

    return typeof onLine === 'boolean' ? onLine : true;
}
