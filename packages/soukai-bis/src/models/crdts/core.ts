import AddPropertyOperation from './AddPropertyOperation';
import DeleteOperation from './DeleteOperation';
import RemovePropertyOperation from './RemovePropertyOperation';
import RestoreOperation from './RestoreOperation';
import SetPropertyOperation from './SetPropertyOperation';
import UnsetPropertyOperation from './UnsetPropertyOperation';

export const coreOperationModels = {
    AddPropertyOperation,
    DeleteOperation,
    RemovePropertyOperation,
    RestoreOperation,
    SetPropertyOperation,
    UnsetPropertyOperation,
};

declare module 'soukai-bis' {
    interface ModelsRegistry {
        AddPropertyOperation: typeof AddPropertyOperation;
        DeleteOperation: typeof DeleteOperation;
        RemovePropertyOperation: typeof RemovePropertyOperation;
        RestoreOperation: typeof RestoreOperation;
        SetPropertyOperation: typeof SetPropertyOperation;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}
