export function studlyCase(str: string): string {
    return str.split(/_|\s/)
        .map(
            word =>
                word.length > 0
                    ? word.substr(0, 1).toUpperCase() + word.substr(1)
                    : word,
        )
        .join('');
}

export function camelCase(str: string): string {
    return str.split(/_|\s/)
        .map(
            (word, index) =>
                (index > 0 && word.length > 0)
                    ? word.substr(0, 1).toUpperCase() + word.substr(1)
                    : word,
        )
        .join('');
}

export default {
    studlyCase,
    camelCase,
};