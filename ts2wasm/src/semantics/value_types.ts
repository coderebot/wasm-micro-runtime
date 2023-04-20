/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import { DumpWriter, CreateDefaultDumpWriter } from './dump.js';

import { ObjectMetaInfo, ClassMetaInfo } from './runtime.js';

export enum ValueTypeKind {
    PRIMITVE_BEGIN = 0,
    VOID,
    UNDEFINED,
    NULL,
    NEVER,
    INT,
    NUMBER,
    BOOLEAN,
    RAW_STRING,
    STRING,
    ANY,
    PRIMITVE_END,
    ARRAY,
    SET,
    MAP,
    OBJECT,
    INTERFACE,
    CLASS,
    FUNCTION,
    UNION,
    INTERSECTION,
    NAMESPACE,
}


export enum PredefinedTypeId {
    VOID = 1,   
    UNDEFINED,
    NULL,
    NEVER,
    INT,
    NUMBER,
    BOOLEAN,
    RAW_STRING,
    STRING,
    ANY,
    NAMESPACE,
    FUNC_VOID_VOID,
    FUNC_VOID_ARRAY_ANY,
    FUNC_ANY_ARRAY_ANY,
    ARRAY_ANY,
    ARRAY_INT,
    ARRAY_NUMBER,
    ARRAY_BOOLEAN,
    ARRAY_STRING,
    SET_ANY,
    SET_INT,
    SET_NUMBER,
    SET_BOOLEAN,
    SET_STRING,
    MAP_STRING_STRING,
    MAP_STRING_ANY,
    MAP_INT_STRING,
    MAP_INT_ANY,
    BUILTIN_TYPE_BEGIN,

    CUSTOM_TYPE_BEGIN = BUILTIN_TYPE_BEGIN + 1000
}

export const CustomTypeId =  PredefinedTypeId.CUSTOM_TYPE_BEGIN;


export class ValueType {
    constructor(public kind: ValueTypeKind, public typeId: number) {}

    equals(other: ValueType) : boolean {
      return this.kind == other.kind && other.typeId == this.typeId;
    }

    toString() : string { return `ValueType[${this.kind}](${this.typeId})`; }
}

export type PrimitiveValueType =
    | number
    | boolean
    | string
    | null
    | undefined
    | never;

export class PrimitiveType extends ValueType {
    constructor(kind: ValueTypeKind, typeId: number) {
        super(kind, typeId);
    }

    toString() : string {
      return `${ValueTypeKind[this.kind]}(${this.typeId})`;
    }
}

export const Primitive = {
    Void: new PrimitiveType(ValueTypeKind.VOID, PredefinedTypeId.VOID),
    Null: new PrimitiveType(ValueTypeKind.NULL, PredefinedTypeId.NULL),
    Undefined: new PrimitiveType(ValueTypeKind.UNDEFINED, PredefinedTypeId.UNDEFINED),
    Never: new PrimitiveType(ValueTypeKind.NEVER, PredefinedTypeId.NEVER),
    Boolean: new PrimitiveType(ValueTypeKind.BOOLEAN, PredefinedTypeId.BOOLEAN),
    Int: new PrimitiveType(ValueTypeKind.INT, PredefinedTypeId.INT),
    Number: new PrimitiveType(ValueTypeKind.NUMBER, PredefinedTypeId.NUMBER),
    RawString: new PrimitiveType(ValueTypeKind.RAW_STRING, PredefinedTypeId.RAW_STRING),
    String: new PrimitiveType(ValueTypeKind.STRING, PredefinedTypeId.STRING),
    Any: new PrimitiveType(ValueTypeKind.ANY, PredefinedTypeId.ANY),
    Namespace: new PrimitiveType(ValueTypeKind.NAMESPACE, PredefinedTypeId.NAMESPACE),
};


export class ArrayType extends ValueType {
    constructor(typeId: number, public element: ValueType, public class_meta?: ClassMetaInfo) {
        super(ValueTypeKind.ARRAY, typeId);
    }

    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      return this.kind == other.kind
          && this.element.equals((other as ArrayType).element);
    }

    toString() : string {
      return `Array<${this.element.toString()}>(${this.typeId})`;
    }
}

export class SetType extends ValueType {
    constructor(typeId: number, public element: ValueType, public class_meta?: ClassMetaInfo) {
        super(ValueTypeKind.SET, typeId);
    }

    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      return this.kind == other.kind
          && this.element.equals((other as SetType).element);
    }

    toString() : string {
      return `Set<${this.element.toString()}>(${this.typeId})`;
    }
}

export class MapType extends ValueType {
    constructor(
        typeId: number,
        public key: ValueType,
        public value: ValueType,
	public class_meta?: ClassMetaInfo
    ) {
        super(ValueTypeKind.MAP, typeId);
    }

    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      return this.kind == other.kind
          && this.key.equals((other as MapType).key)
          && this.value.equals((other as MapType).value);
    }

    toString() : string {
      return `Map<${this.key.toString()}, ${this.value.toString()}>(${this.typeId})`;
    }

}

export type BuiltinCollectionType = ArrayType | SetType | MapType;

export class ObjectType extends ValueType {
    constructor(typeId: number, public meta: ObjectMetaInfo) {
        super(ValueTypeKind.OBJECT, typeId);
    }

    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      return this.kind == other.kind
          && this.meta.typeId == (other as ObjectType).meta.typeId;
    }

    toString() : string {
      return `Object[${this.meta.name}](${this.typeId})`;
    }

}

export class InterfaceType extends ValueType {
    constructor(public class_meta: ClassMetaInfo) {
        super(ValueTypeKind.INTERFACE, class_meta.instance.typeId);
    }
    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      return this.kind == other.kind
          && this.class_meta.instance.typeId == (other as InterfaceType).class_meta.instance.typeId;
    }

    toString() : string {
      return `Interface[${this.class_meta.instance.name}](${this.typeId})`;
    }
}

export class ClassType extends ValueType {
    constructor(public class_meta: ClassMetaInfo) {
        super(ValueTypeKind.CLASS, class_meta.instance.typeId);
    }
    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      return this.kind == other.kind
          && this.class_meta.instance.typeId == (other as ClassType).class_meta.instance.typeId;
    }

    toString() : string {
      return `Class[${this.class_meta.instance.name}](${this.typeId})`;
    }
}

export class UnionType extends ValueType {
    constructor(typeId: number, public types: ValueType[]) {
        super(ValueTypeKind.UNION, typeId);
    }

    toString() : string {
      const ts : string[] = [];
      for (const t of this.types) {
        ts.push(t.toString()); 
      }
      return `${ts.join('|')}(${this.typeId})`;
    }

    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      if (this.kind != other.kind) return false;
      const other_union = other as UnionType;

      if (this.types.length != other_union.types.length) return false;

      for (const t of this.types) {
	let matched = false;
        for (const o of other_union.types) {
          if (o.equals(t)) {
	    matched = true;
	    break;
	  }
	}
	if (!matched) return false;
      }
      return true;
    }
}

export class FunctionType extends ValueType {
    constructor(
        typeId: number,
        public returnType: ValueType,
        public argumentsType: ValueType[],
	public hasRest: boolean
    ) {
        super(ValueTypeKind.FUNCTION, typeId);
    }

    equals(other: ValueType) : boolean {
      if (!super.equals(other)) return false;

      if (this.kind != other.kind) return false;

      const other_func = other as FunctionType;

      if (!this.returnType.equals(other_func.returnType)) return false;
      if (this.argumentsType.length != other_func.argumentsType.length) return false;

      for (let i = 0; i < this.argumentsType.length; i ++) {
        if (!this.argumentsType[i].equals(other_func.argumentsType[i]))
          return false;
      }
      return true;
    }

    toString() : string {
      const params : string[] = [];
      for (const p of this.argumentsType) {
        params.push(p.toString());
      }
      return `Function(${params.join(',')}) : ${this.returnType.toString()}`;
    }
}
