import type { Engine } from 'soukai/engines/Engine';

export function engineClosesConnections(engine: Engine): engine is Engine & ClosesConnections {
    return 'closeConnections' in engine;
}

export interface ClosesConnections {
    closeConnections(): Promise<void>;
}
