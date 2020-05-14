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
    return str.split(/_|\s|(?=[A-Z])/)
        .map(
            (word, index) => {
                if (word.length === 0) {
                    return word;
                }

                if (index === 0) {
                    return word.toLowerCase();
                }

                return word.substr(0, 1).toUpperCase() + word.substr(1).toLowerCase();
            },
        )
        .join('');
}

export default {
    studlyCase,
    camelCase,
};
