/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import {
    ValueTypeKind,
    ValueType,
    ArrayType,
    MapType,
    SetType,
    Primitive,
    FunctionType,
    PredefinedTypeId,
} from './value_types.js';

import {
    MemberType,
    MemberInfo,
    ObjectMetaInfo,
    ClassMetaInfo,
    ClassMetaFlag,
    FindMemberFromMeta,
} from './runtime.js';


export function IsBuiltInObjectType(kind: ValueTypeKind) : boolean {
     return kind == ValueTypeKind.ARRAY
	 || kind == ValueTypeKind.SET
	 || kind == ValueTypeKind.MAP
	 || kind == ValueTypeKind.STRING     // string and raw string is object
	 || kind == ValueTypeKind.RAW_STRING
	 || kind == ValueTypeKind.OBJECT;

}

export function IsBuiltInType(kind: ValueTypeKind) : boolean {
  return (kind >= ValueTypeKind.PRIMITVE_BEGIN && kind < ValueTypeKind.PRIMITVE_END)
         || IsBuiltInObjectType(kind);
}

export function IsBuiltInTypeButAny(kind: ValueTypeKind) : boolean {
  return kind != ValueTypeKind.ANY && IsBuiltInType(kind);
}

///////////////////////////////////////////////////

const FuncStringString = new FunctionType(PredefinedTypeId.BUILTIN_TYPE_BEGIN + 1,
					  Primitive.String, [Primitive.String], false);

const FuncGetLength = new FunctionType(PredefinedTypeId.BUILTIN_TYPE_BEGIN + 2,
				       Primitive.Int, [], false);

const string_members : MemberInfo[] = [
  { name: 'length', type: MemberType.GETTER, index: 0, valueType: FuncGetLength},
  { name: 'slice', type: MemberType.METHOD, index: 1, valueType: FuncStringString},
  { name: 'concat', type: MemberType.METHOD, index: 2, valueType: FuncStringString},
]

const builtin_namespace = "bultin";
const builtin_flags = ClassMetaFlag.BUILTIN | ClassMetaFlag.EXPORT;

const PrimtiveTypeInfos : ClassMetaInfo[] = [
  {
    namespace: builtin_namespace,
    flags: builtin_flags,
    instance: {
      name: 'Int',
      typeId: ValueTypeKind.INT,
      members : []
    }
  },
  {
    namespace: builtin_namespace,
    flags: builtin_flags,
    instance: {
      name: 'Number',
      typeId: ValueTypeKind.NUMBER,
      members : []
    }
  },
  {
    namespace: builtin_namespace,
    flags: builtin_flags,
    instance: {
      name: 'RawString',
      typeId: ValueTypeKind.RAW_STRING,
      members : string_members,
    }
  },
  {
    namespace: builtin_namespace,
    flags: builtin_flags,
    instance: {
      name: 'String',
      typeId: ValueTypeKind.STRING,
      members: string_members,
    }
  }
]


function createArrayClassMeta(arrType: ArrayType) : ClassMetaInfo {
  return <ClassMetaInfo> {
    namespace: builtin_namespace,
    flags: builtin_flags,
    instance: {
      name: 'Array',
      typeId: ValueTypeKind.ARRAY,
      members: [
        {name: 'length', type: MemberType.GETTER, index: 0, valueType: FuncGetLength},
	{name: 'slice', type: MemberType.METHOD, index: 1, valueType: new FunctionType(-1, arrType, [Primitive.Int, Primitive.Int], false)}
      ]
    }
  };
}

const collectionTypes = new Map<ValueType, ClassMetaInfo>();

export function createCollectionType(type: ValueType) : ClassMetaInfo | undefined {
  let class_meta : ClassMetaInfo | undefined = undefined;
  if (type.kind == ValueTypeKind.ARRAY) {
    class_meta = createArrayClassMeta(type as ArrayType); 
  }

  if (class_meta) {
    collectionTypes.set(type, class_meta);
  }
  return class_meta;
}

export function GetBuiltInMemberType(type: ValueType, name: string, as_write: boolean) : MemberInfo | undefined {
  let class_meta : ClassMetaInfo | undefined = undefined;
  for (const bt of PrimtiveTypeInfos) {
    if (bt.instance && bt.instance.typeId == type.kind) {
      class_meta = bt;
      break;
    }
  }

  if (!class_meta) {
    if (!(type.kind == ValueTypeKind.ARRAY
          || type.kind == ValueTypeKind.SET
          || type.kind == ValueTypeKind.MAP))
      return undefined;

    class_meta = collectionTypes.get(type);

    if (!class_meta) {
      class_meta = createCollectionType(type);
    }
  }

  if (!class_meta) return undefined;

  return FindMemberFromMeta(class_meta!.instance, name, as_write);
}

