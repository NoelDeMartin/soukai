export function deepClone(object: object): object {
    object = { ...object };

    for (const property in object) {
        if (
            object.hasOwnProperty(property) &&
            typeof object[property] === 'object' &&
            object[property].constructor === Object
        ) {
            object[property] = deepClone(object[property]);
        }
    }

    return object;
}
