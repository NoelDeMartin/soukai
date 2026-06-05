let defaultNamespace = 'soukai';

export function setNamespace(namespace: string): void {
    defaultNamespace = namespace;
}

export function getNamespace(): string {
    return defaultNamespace;
}
