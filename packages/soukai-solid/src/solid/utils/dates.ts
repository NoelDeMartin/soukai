export function renderRDFDateValue(date: Date): string {
    const digits = (...numbers: number[]) => numbers.map((number) => number.toString().padStart(2, '0'));
    const day = digits(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()).join('-');
    const time = digits(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()).join(':');
    const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');

    return `${day}T${time}.${milliseconds}Z`;
}
