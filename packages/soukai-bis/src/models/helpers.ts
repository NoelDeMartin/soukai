export function bootModels(
    models: Record<string, { boot(name: string): unknown; reset(): void }>,
    reset: boolean = false,
): void {
    for (const [modelName, modelClass] of Object.entries(models)) {
        reset && modelClass.reset();

        modelClass.boot(modelName);
    }
}
