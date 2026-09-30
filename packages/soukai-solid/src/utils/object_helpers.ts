export function toDate(value: unknown): Date | null {
    // oxlint-disable-next-line typescript/no-explicit-any
    const date = new Date(value as any);

    return isNaN(date.getTime()) ? null : date;
}
