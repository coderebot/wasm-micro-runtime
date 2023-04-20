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
} from './value_types.js';

import {
    MemberType,
    MemberInfo,
    ObjectMetaInfo,
    ClassMetaInfo,
    ClassMetaFlag,
} from './runtime.js';


export function IsBuiltInObjectType(kind: ValueTypeKind) : boolean {
     return kind == ValueTypeKind.ARRAY
	 || kind == ValueTypeKind.SET
	 || kind == ValueTypeKind.MAP
	 || kind == ValueTypeKind.OBJECT;

}

export function IsBuiltInType(kind: ValueTypeKind) : boolean {
  return (kind >= ValueTypeKind.PRIMITVE_BEGIN && kind < ValueTypeKind.PRIMITVE_END)
         || IsBuiltInObjectType(kind);
}

const string_members : MemberInfo[] = [
  { name: 'length', type: MemberType.ACCESSOR, index: 0, valueType: Primitive.Int},
  { name: 'slice', type: MemberType.METHOD, index: 1, valueType: Primitive.String},
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
        {name: 'length', type: MemberType.ACCESSOR, index: 0, valueType: Primitive.Int},
	{name: 'slice', type: MemberType.METHOD, index: 1, valueType: arrType}
      ]
    }
  };
}

const collectionTypes = new Map<ValueType, ClassMetaInfo>();

function createCollectionType(type: ValueType) : ClassMetaInfo | undefined {
  let class_meta : ClassMetaInfo | undefined = undefined;
  if (type.kind == ValueTypeKind.ARRAY) {
    class_meta = createArrayClassMeta(type as ArrayType); 
  }

  if (class_meta) {
    collectionTypes.set(type, class_meta);
  }
  return class_meta;
}

export function GetBuiltInMemberType(type: ValueType, name: string) : MemberInfo | undefined {
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

  for (const m of class_meta!.instance.members)
  {
    if (m.name == name) return m;
  }

  return undefined;
}

