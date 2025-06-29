export function toDate(value: unknown): Date | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const date = new Date(value as any);

    return isNaN(date.getTime()) ? null : date;
}
