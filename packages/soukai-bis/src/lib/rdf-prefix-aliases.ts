import { RDFNamedNode } from '@noeldemartin/solid-utils';
import type { NamedNode } from '@rdfjs/types';

interface PrefixAlias {
    prefix: string;
    alias: string;
    canonical: boolean;
}

let prefixAliases = new Map<string, PrefixAlias>();
let variantsCache = new Map<string, string[]>();
let namedNodeVariantsCache = new Map<string, NamedNode[]>();

function findPrefixAlias(iri: string): PrefixAlias | undefined {
    if (prefixAliases.size === 0) {
        return;
    }

    for (const [prefix, alias] of prefixAliases) {
        if (!iri.startsWith(prefix)) {
            continue;
        }

        return alias;
    }
}

function initializeRDFIriVariant(iri: string): string[] {
    const match = findPrefixAlias(iri);
    const result = match ? [iri, `${match.alias}${iri.slice(match.prefix.length)}`] : [iri];

    variantsCache.set(iri, result);

    return result;
}

function initializeRDFNamedNodeVariant(node: NamedNode): NamedNode[] {
    const variants = getRDFIriVariants(node.value);
    const nodes = variants.length === 1 ? [node] : [node, ...variants.slice(1).map((iri) => new RDFNamedNode(iri))];

    namedNodeVariantsCache.set(node.value, nodes);

    return nodes;
}

export function setRDFPrefixAliases(aliases: Record<string, string>): void {
    const entries: PrefixAlias[] = [];

    for (const [source, target] of Object.entries(aliases)) {
        if (!source || !target || source === target) {
            continue;
        }

        entries.push({ prefix: source, alias: target, canonical: true });
        entries.push({ prefix: target, alias: source, canonical: false });
    }

    prefixAliases = new Map(entries.map((entry) => [entry.prefix, entry]));
    variantsCache = new Map();
    namedNodeVariantsCache = new Map();
}

export function getRDFIriVariants(iri: string): string[] {
    if (prefixAliases.size === 0) {
        return [iri];
    }

    return variantsCache.get(iri) ?? initializeRDFIriVariant(iri);
}

export function getRDFNamedNodeVariants(node: NamedNode): NamedNode[] {
    if (prefixAliases.size === 0) {
        return [node];
    }

    return namedNodeVariantsCache.get(node.value) ?? initializeRDFNamedNodeVariant(node);
}

export function normalizeRDFIri(iri: string): string {
    const match = findPrefixAlias(iri);

    if (!match || match.canonical) {
        return iri;
    }

    return `${match.alias}${iri.slice(match.prefix.length)}`;
}
