export const LOCAL_URL_PROTOCOL = 'solid:';

export function isLocalUrl(url: string): boolean {
    return url.startsWith(LOCAL_URL_PROTOCOL);
}
