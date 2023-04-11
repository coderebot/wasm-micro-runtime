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
    CUSTOM_TYPE_BEGIN
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
};


export class ArrayType extends ValueType {
    constructor(typeId: number, public element: ValueType) {
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

export const PredefinedArrayType = {
   ArrayAny : new ArrayType(PredefinedTypeId.ARRAY_ANY, Primitive.Any),
   ArrayInt : new ArrayType(PredefinedTypeId.ARRAY_INT, Primitive.Int),
   ArrayNumber : new ArrayType(PredefinedTypeId.ARRAY_NUMBER, Primitive.Number),
   ArrayBoolean : new ArrayType(PredefinedTypeId.ARRAY_BOOLEAN, Primitive.Boolean),
   ArrayString : new ArrayType(PredefinedTypeId.ARRAY_STRING, Primitive.String)
}

export class SetType extends ValueType {
    constructor(typeId: number, public element: ValueType) {
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

export const PredefinedSetType = {
   SetAny : new SetType(PredefinedTypeId.SET_ANY, Primitive.Any),
   SetInt : new SetType(PredefinedTypeId.SET_INT, Primitive.Int),
   SetNumber : new SetType(PredefinedTypeId.SET_NUMBER, Primitive.Number),
   SetBoolean : new SetType(PredefinedTypeId.SET_BOOLEAN, Primitive.Boolean),
   SetString : new ArrayType(PredefinedTypeId.SET_STRING, Primitive.String)
}

export class MapType extends ValueType {
    constructor(
        typeId: number,
        public key: ValueType,
        public value: ValueType,
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

export const PredefinedMapType = {
  MapStringString : new MapType(PredefinedTypeId.MAP_STRING_STRING, Primitive.String, Primitive.String),
  MapStringAny : new MapType(PredefinedTypeId.MAP_STRING_ANY, Primitive.String, Primitive.Any),
  MapIntString : new MapType(PredefinedTypeId.MAP_INT_STRING, Primitive.Int, Primitive.String),
  MapIntAny : new MapType(PredefinedTypeId.MAP_INT_ANY, Primitive.Int, Primitive.Any),
}

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

export const PredefinedFunctionType = {
   FuncVoidVoid : new FunctionType(PredefinedTypeId.FUNC_VOID_VOID, Primitive.Void, [], false),
   FuncVoidArrayAny: new FunctionType(PredefinedTypeId.FUNC_VOID_ARRAY_ANY, Primitive.Void, [PredefinedArrayType.ArrayAny], true),
   FuncAnyArrayAny: new FunctionType(PredefinedTypeId.FUNC_ANY_ARRAY_ANY, Primitive.Any, [PredefinedArrayType.ArrayAny], true),
}


export function GetPredefinedType(typeId: number) : ValueType | undefined
{
	switch(typeId) {
	  case PredefinedTypeId.VOID      : return Primitive.Void;
	  case PredefinedTypeId.UNDEFINED : return Primitive.Undefined;
	  case PredefinedTypeId.NULL      : return Primitive.Null;
	  case PredefinedTypeId.NEVER     : return Primitive.Never;
	  case PredefinedTypeId.INT       : return Primitive.Int;
	  case PredefinedTypeId.NUMBER    : return Primitive.Number;
	  case PredefinedTypeId.BOOLEAN   : return Primitive.Boolean;
	  case PredefinedTypeId.RAW_STRING : return Primitive.RawString;
	  case PredefinedTypeId.STRING    : return Primitive.String;
	  case PredefinedTypeId.ANY       : return Primitive.Any;
	  case PredefinedTypeId.FUNC_VOID_VOID : return PredefinedFunctionType.FuncVoidVoid;
	  case PredefinedTypeId.ARRAY_ANY : return PredefinedArrayType.ArrayAny;
	  case PredefinedTypeId.ARRAY_INT : return PredefinedArrayType.ArrayInt;
	  case PredefinedTypeId.ARRAY_NUMBER   : return PredefinedArrayType.ArrayNumber;
	  case PredefinedTypeId.ARRAY_BOOLEAN  : return PredefinedArrayType.ArrayBoolean;
	  case PredefinedTypeId.ARRAY_STRING   : return PredefinedArrayType.ArrayString;
	  case PredefinedTypeId.SET_ANY   :  return PredefinedSetType.SetAny;
	  case PredefinedTypeId.SET_INT   :  return PredefinedSetType.SetInt;
	  case PredefinedTypeId.SET_NUMBER:  return PredefinedSetType.SetNumber;
	  case PredefinedTypeId.SET_BOOLEAN    : return PredefinedSetType.SetBoolean;
	  case PredefinedTypeId.SET_STRING: return PredefinedSetType.SetString;
	  case PredefinedTypeId.MAP_STRING_STRING: return PredefinedMapType.MapStringString;
	  case PredefinedTypeId.MAP_STRING_ANY : return PredefinedMapType.MapStringAny;
	  case PredefinedTypeId.MAP_INT_STRING : return PredefinedMapType.MapIntString;
	  case PredefinedTypeId.MAP_INT_ANY: return PredefinedMapType.MapIntAny;
	  case PredefinedTypeId.FUNC_VOID_VOID: return PredefinedFunctionType.FuncVoidVoid;
	  case PredefinedTypeId.FUNC_VOID_ARRAY_ANY: return PredefinedFunctionType.FuncVoidArrayAny;
	  case PredefinedTypeId.FUNC_ANY_ARRAY_ANY:  return PredefinedFunctionType.FuncAnyArrayAny;
	}
	return undefined;
}

export function GetPredefinedArrayType(kind: ValueTypeKind) : ValueType | undefined {
  switch(kind) {
    case ValueTypeKind.ANY: return PredefinedArrayType.ArrayAny;
    case ValueTypeKind.INT: return PredefinedArrayType.ArrayInt;
    case ValueTypeKind.NUMBER: return PredefinedArrayType.ArrayNumber;
    case ValueTypeKind.BOOLEAN: return PredefinedArrayType.ArrayBoolean;
    case ValueTypeKind.STRING:  return PredefinedArrayType.ArrayString;
  }
  return undefined;
}

export function GetPredefinedSetType(kind: ValueTypeKind) : ValueType | undefined {
  switch(kind) {
    case ValueTypeKind.ANY: return PredefinedSetType.SetAny;
    case ValueTypeKind.INT: return PredefinedSetType.SetInt;
    case ValueTypeKind.NUMBER: return PredefinedSetType.SetNumber;
    case ValueTypeKind.BOOLEAN: return PredefinedSetType.SetBoolean;
    case ValueTypeKind.STRING:  return PredefinedSetType.SetString;
  }
  return undefined;
}

export function GetPredefinedMapType(key: ValueTypeKind, value: ValueTypeKind) : ValueType | undefined {
  if (key == ValueTypeKind.STRING && value == ValueTypeKind.STRING)
    return PredefinedMapType.MapStringString;

  if (key == ValueTypeKind.STRING && value == ValueTypeKind.ANY)
    return PredefinedMapType.MapStringAny;

  if (key == ValueTypeKind.INT && value == ValueTypeKind.STRING)
    return PredefinedMapType.MapIntAny;

  if (key == ValueTypeKind.INT && value == ValueTypeKind.ANY)
    return PredefinedMapType.MapIntAny;

  return undefined;
}
