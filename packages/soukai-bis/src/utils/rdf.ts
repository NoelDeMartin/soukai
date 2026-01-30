import { RDFLiteral, RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import type { Literal } from '@rdfjs/types';

export const CRDT_DATE = 'https://vocab.noeldemartin.com/crdt/date';
export const CRDT_PROPERTY = 'https://vocab.noeldemartin.com/crdt/property';
export const CRDT_RESOURCE = 'https://vocab.noeldemartin.com/crdt/resource';
export const CRDT_SET_PROPERTY_OPERATION = 'https://vocab.noeldemartin.com/crdt/SetPropertyOperation';
export const CRDT_UNSET_PROPERTY_OPERATION = 'https://vocab.noeldemartin.com/crdt/UnsetPropertyOperation';
export const CRDT_VALUE = 'https://vocab.noeldemartin.com/crdt/value';
export const LDP_BASIC_CONTAINER = expandIRI('ldp:BasicContainer');
export const LDP_CONTAINER = expandIRI('ldp:Container');
export const LDP_CONTAINS = expandIRI('ldp:contains');
export const RDF_TYPE = expandIRI('rdf:type');
export const XSD_DATE_TIME = expandIRI('xsd:dateTime');
export const XSD_INTEGER = expandIRI('xsd:integer');

export const CRDT_DATE_PREDICATE = new RDFNamedNode(CRDT_DATE);
export const CRDT_PROPERTY_PREDICATE = new RDFNamedNode(CRDT_PROPERTY);
export const CRDT_RESOURCE_PREDICATE = new RDFNamedNode(CRDT_RESOURCE);
export const CRDT_SET_PROPERTY_OPERATION_OBJECT = new RDFNamedNode(CRDT_SET_PROPERTY_OPERATION);
export const CRDT_UNSET_PROPERTY_OPERATION_OBJECT = new RDFNamedNode(CRDT_UNSET_PROPERTY_OPERATION);
export const CRDT_VALUE_PREDICATE = new RDFNamedNode(CRDT_VALUE);
export const LDP_BASIC_CONTAINER_OBJECT = new RDFNamedNode(LDP_BASIC_CONTAINER);
export const LDP_CONTAINER_OBJECT = new RDFNamedNode(LDP_CONTAINER);
export const LDP_CONTAINS_PREDICATE = new RDFNamedNode(LDP_CONTAINS);
export const RDF_TYPE_PREDICATE = new RDFNamedNode(RDF_TYPE);
export const XSD_DATE_TIME_TYPE = new RDFNamedNode(XSD_DATE_TIME);
export const XSD_INTEGER_TYPE = new RDFNamedNode(XSD_INTEGER);

export function createRDFLiteral(value: unknown): Literal {
    if (value instanceof Date) {
        return new RDFLiteral(value.toISOString(), undefined, XSD_DATE_TIME_TYPE);
    }

    if (typeof value === 'number') {
        return new RDFLiteral(String(value), undefined, XSD_INTEGER_TYPE);
    }

    return new RDFLiteral(String(value));
}
