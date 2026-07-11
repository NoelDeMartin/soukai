import SetPropertyOperation from './SetPropertyOperation';
import UnsetPropertyOperation from './UnsetPropertyOperation';

export const coreOperationModels = {
    SetPropertyOperation,
    UnsetPropertyOperation,
};

declare module 'soukai-bis' {
    interface ModelsRegistry {
        SetPropertyOperation: typeof SetPropertyOperation;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}
