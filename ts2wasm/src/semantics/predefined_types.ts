/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */


import { createCollectionType } from './builtin.js';

import {
  ValueTypeKind,
  ValueType,
  Primitive,
  PrimitiveType,
  ArrayType,
  SetType,
  MapType,
  FunctionType,
  PredefinedTypeId,
  BuiltinCollectionType,
} from './value_types.js';


function createPredefinedCollectionType<T>(type: T) : T {
  const ct = type as BuiltinCollectionType;
  ct.class_meta = createCollectionType(ct);
  
  return type;
}

export const PredefinedArrayType = {
   ArrayAny : createPredefinedCollectionType(new ArrayType(PredefinedTypeId.ARRAY_ANY, Primitive.Any)),
   ArrayInt : createPredefinedCollectionType(new ArrayType(PredefinedTypeId.ARRAY_INT, Primitive.Int)),
   ArrayNumber : createPredefinedCollectionType(new ArrayType(PredefinedTypeId.ARRAY_NUMBER, Primitive.Number)),
   ArrayBoolean : createPredefinedCollectionType(new ArrayType(PredefinedTypeId.ARRAY_BOOLEAN, Primitive.Boolean)),
   ArrayString : createPredefinedCollectionType(new ArrayType(PredefinedTypeId.ARRAY_STRING, Primitive.String))
}

export const PredefinedSetType = {
   SetAny : createPredefinedCollectionType(new SetType(PredefinedTypeId.SET_ANY, Primitive.Any)),
   SetInt : createPredefinedCollectionType(new SetType(PredefinedTypeId.SET_INT, Primitive.Int)),
   SetNumber : createPredefinedCollectionType(new SetType(PredefinedTypeId.SET_NUMBER, Primitive.Number)),
   SetBoolean : createPredefinedCollectionType(new SetType(PredefinedTypeId.SET_BOOLEAN, Primitive.Boolean)),
   SetString : createPredefinedCollectionType(new ArrayType(PredefinedTypeId.SET_STRING, Primitive.String))
}

export const PredefinedMapType = {
  MapStringString : createPredefinedCollectionType(new MapType(PredefinedTypeId.MAP_STRING_STRING, Primitive.String, Primitive.String)),
  MapStringAny : createPredefinedCollectionType(new MapType(PredefinedTypeId.MAP_STRING_ANY, Primitive.String, Primitive.Any)),
  MapIntString : createPredefinedCollectionType(new MapType(PredefinedTypeId.MAP_INT_STRING, Primitive.Int, Primitive.String)),
  MapIntAny : createPredefinedCollectionType(new MapType(PredefinedTypeId.MAP_INT_ANY, Primitive.Int, Primitive.Any)),
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
