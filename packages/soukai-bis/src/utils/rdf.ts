import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';

export const LDP_BASIC_CONTAINER = expandIRI('ldp:BasicContainer');
export const LDP_CONTAINER = expandIRI('ldp:Container');
export const LDP_CONTAINS = expandIRI('ldp:contains');
export const RDF_TYPE = expandIRI('rdf:type');
export const XSD_DATE_TIME = expandIRI('xsd:dateTime');
export const XSD_INTEGER = expandIRI('xsd:integer');

export const LDP_BASIC_CONTAINER_OBJECT = new RDFNamedNode(LDP_BASIC_CONTAINER);
export const LDP_CONTAINER_OBJECT = new RDFNamedNode(LDP_CONTAINER);
export const LDP_CONTAINS_PREDICATE = new RDFNamedNode(LDP_CONTAINS);
export const RDF_TYPE_PREDICATE = new RDFNamedNode(RDF_TYPE);
export const XSD_DATE_TIME_TYPE = new RDFNamedNode(XSD_DATE_TIME);
export const XSD_INTEGER_TYPE = new RDFNamedNode(XSD_INTEGER);
