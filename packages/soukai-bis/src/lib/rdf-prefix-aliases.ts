import { resetRDFPrefixAliases, type PrefixAlias } from 'soukai-bis/lib/internals/rdf-prefix-aliases';

export function setRDFPrefixAliases(aliases: Record<string, string>): void {
    const aliasesArray: PrefixAlias[] = [];

    for (const [source, target] of Object.entries(aliases)) {
        if (!source || !target || source === target) {
            continue;
        }

        aliasesArray.push({ prefix: source, alias: target, canonical: true });
        aliasesArray.push({ prefix: target, alias: source, canonical: false });
    }

    resetRDFPrefixAliases(aliasesArray);
}
