import type { Literal, Quad } from '@rdfjs/types';

import IRI from 'soukai-solid/solid/utils/IRI';
import { RDF_TYPE } from 'soukai-solid/solid/constants';

export type LiteralValue = string | number | boolean | Date;

export const enum RDFResourcePropertyType {
    Type,
    Reference,
    Literal,
}

class RDFResourcePropertyVariable {

    public name: string;

    constructor(value: string) {
        this.name = value;
    }

}

const DataTypes = {
    dateTime: IRI('xsd:dateTime'),
    integer: IRI('xsd:integer'),
    boolean: IRI('xsd:boolean'),
    decimal: IRI('xsd:decimal'),
    float: IRI('xsd:float'),
    double: IRI('xsd:double'),
};

abstract class RDFResourceProperty {

    public readonly resourceUrl: string | null;
    public readonly name: string;
    public readonly value: unknown;
    public abstract readonly type: RDFResourcePropertyType;

    public static fromStatement(statement: Quad): RDFResourceProperty {
        const resourceUrl = statement.subject.termType === 'NamedNode' ? statement.subject.value : null;

        if (statement.predicate.value === RDF_TYPE) {
            return this.type(resourceUrl, statement.object.value);
        }

        if (statement.object.termType === 'NamedNode') {
            return this.reference(resourceUrl, statement.predicate.value, decodeURI(statement.object.value));
        }

        if (statement.object.termType === 'BlankNode') {
            return this.reference(resourceUrl, statement.predicate.value, null);
        }

        if (statement.object.termType === 'Variable') {
            return this.reference(
                resourceUrl,
                statement.predicate.value,
                new RDFResourcePropertyVariable(statement.object.value),
            );
        }

        const object = statement.object as Literal;

        return this.literal(
            resourceUrl,
            statement.predicate.value,
            this.castLiteralValue(statement.object.value, object.datatype.value),
            object.value,
        );
    }

    public static literal(
        resourceUrl: string | null,
        name: string,
        value: LiteralValue,
        originalValue?: unknown,
    ): RDFResourceProperty {
        return new RDFResourceLiteralProperty(resourceUrl, name, value, originalValue);
    }

    public static reference(
        resourceUrl: string | null,
        name: string,
        url: string | RDFResourcePropertyVariable | null,
    ): RDFResourceReferenceProperty {
        return new RDFResourceReferenceProperty(resourceUrl, name, url);
    }

    public static type(resourceUrl: string | null, type: string): RDFResourceProperty {
        return new RDFResourceTypeProperty(resourceUrl, type);
    }

    public static toTurtle(properties: RDFResourceProperty[], documentUrl: string | null = null): string {
        return properties.map((property) => property.toTurtle(documentUrl) + ' .').join('\n');
    }

    private static castLiteralValue(value: string, datatype: string): LiteralValue {
        switch (datatype) {
            case DataTypes.dateTime:
                return new Date(value);
            case DataTypes.integer:
            case DataTypes.decimal:
                return parseInt(value);
            case DataTypes.boolean:
                return value === 'true' || value === '1';
            case DataTypes.float:
            case DataTypes.double:
                return parseFloat(value);
        }

        return value;
    }

    protected constructor(resourceUrl: string | null, name: string, value: unknown) {
        this.resourceUrl = resourceUrl;
        this.name = name;
        this.value = value;
    }

    public toTurtle(documentUrl: string | null = null): string {
        const subject = this.getTurtleSubject(documentUrl);
        const predicate = this.getTurtlePredicate();
        const object = this.getTurtleObject(documentUrl);

        return `${subject} ${predicate} ${object}`;
    }

    public clone(resourceUrl?: string | null): RDFResourceProperty {
        resourceUrl = resourceUrl ?? this.resourceUrl;

        switch (this.type) {
            case RDFResourcePropertyType.Literal: {
                const property = this as unknown as RDFResourceLiteralProperty;

                return RDFResourceProperty.literal(resourceUrl, property.name, property.value, property.originalValue);
            }
            case RDFResourcePropertyType.Type:
                return RDFResourceProperty.type(resourceUrl, this.value as string);
            case RDFResourcePropertyType.Reference:
                return RDFResourceProperty.reference(resourceUrl, this.name, this.value as string);
        }
    }

    public valueEquals(other: RDFResourceProperty): boolean {
        const value = this.value instanceof Date ? this.value.getTime() : this.value;
        const otherValue = other.value instanceof Date ? other.value.getTime() : other.value;

        return value === otherValue;
    }

    protected getTurtleReference(value: string | null, documentUrl: string | null): string {
        const hashIndex = value?.indexOf('#') ?? -1;

        if (!value || value === documentUrl) {
            return '<>';
        }

        if (documentUrl === null || !value.startsWith(documentUrl) || hashIndex === -1) {
            return `<${encodeURI(value)}>`;
        }

        return `<#${value.slice(hashIndex + 1)}>`;
    }

    protected getTurtleSubject(documentUrl: string | null): string {
        return this.getTurtleReference(this.resourceUrl, documentUrl);
    }

    protected getTurtlePredicate(): string {
        return `<${encodeURI(this.name)}>`;
    }

    protected abstract getTurtleObject(documentUrl: string | null): string;

}

class RDFResourceLiteralProperty extends RDFResourceProperty {

    declare public readonly value: LiteralValue;
    declare public readonly originalValue?: unknown;
    public readonly type = RDFResourcePropertyType.Literal;

    constructor(resourceUrl: string | null, name: string, value: LiteralValue, originalValue?: unknown) {
        super(resourceUrl, name, value);

        this.originalValue = originalValue;
    }

    protected getTurtleObject(): string {
        if (this.originalValue && this.value instanceof Date) {
            return `"${this.originalValue}"^^<${IRI('xsd:dateTime')}>`;
        }

        if (this.value instanceof Date) {
            const digits = (...numbers: number[]) => numbers.map((number) => number.toString().padStart(2, '0'));
            const date = digits(
                this.value.getUTCFullYear(),
                this.value.getUTCMonth() + 1,
                this.value.getUTCDate(),
            ).join('-');
            const time = digits(this.value.getUTCHours(), this.value.getUTCMinutes(), this.value.getUTCSeconds()).join(
                ':',
            );
            const milliseconds = this.value.getUTCMilliseconds().toString().padStart(3, '0');

            return `"${date}T${time}.${milliseconds}Z"^^<${IRI('xsd:dateTime')}>`;
        }

        return JSON.stringify(this.value);
    }

}

class RDFResourceReferenceProperty extends RDFResourceProperty {

    declare public readonly value: string | RDFResourcePropertyVariable | null;
    public readonly type = RDFResourcePropertyType.Reference;

    constructor(resourceUrl: string | null, name: string, value: string | RDFResourcePropertyVariable | null) {
        super(resourceUrl, name, value);
    }

    protected getTurtleObject(documentUrl: string | null): string {
        if (this.value instanceof RDFResourcePropertyVariable) return this.value.name;

        return this.getTurtleReference(this.value, documentUrl);
    }

}

class RDFResourceTypeProperty extends RDFResourceProperty {

    declare public readonly value: string;
    public readonly type = RDFResourcePropertyType.Type;

    constructor(resourceUrl: string | null, value: string) {
        super(resourceUrl, RDF_TYPE, value);
    }

    protected getTurtlePredicate(): string {
        return 'a';
    }

    protected getTurtleObject(): string {
        return `<${encodeURI(this.value)}>`;
    }

}

export default RDFResourceProperty;
