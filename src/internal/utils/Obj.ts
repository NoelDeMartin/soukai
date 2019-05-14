export function deepClone(object: object): object {
    object = { ...object };

    for (const property in object) {
        if (
            object.hasOwnProperty(property) &&
            object[property] !== null &&
            typeof object[property] === 'object' &&
            object[property].constructor === Object
        ) {
            object[property] = deepClone(object[property]);
        }
    }

    return object;
}

export function deepEquals(a: any, b: any): boolean {
    if (a === b) {
        return true;
    }

    const typeOfA = typeof a;
    if (typeOfA !== typeof b) {
        return false;
    }

    if (typeOfA !== 'object' || a === null || b === null) {
        return false;
    }

    if (Object.keys(a).length !== Object.keys(b).length) {
        return false;
    }

    for (const key in a) {
        if (!deepEquals(a[key], b[key])) {
            return false;
        }
    }

    return true;
}

export default {
    deepClone,
    deepEquals,
};
