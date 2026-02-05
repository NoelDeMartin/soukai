import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyReplacements } from '@noeldemartin/utils';

export function loadFixture<T = string>(nameOrUrl: string | URL, replacements: Record<string, string> = {}): T {
    const path =
        typeof nameOrUrl === 'string' ? `${__dirname}/../../tests/fixtures/${nameOrUrl}` : fileURLToPath(nameOrUrl);
    const raw = applyReplacements(readFileSync(path).toString(), replacements);

    return /\.json(ld)$/.test(path) ? JSON.parse(raw) : (raw as T);
}
