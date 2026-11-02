export const LOCAL_URL_PROTOCOL = 'local:';

export function isLocalUrl(url: string): boolean {
    return url.startsWith(`${LOCAL_URL_PROTOCOL}//`);
}
