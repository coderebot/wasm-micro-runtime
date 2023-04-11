/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import { ValueType } from './value_types.js';
import { Type } from '../type.js';

export enum MemberType {
    FIELD,
    METHOD,
    ACCESSOR,
    GETTER,
    SETTER,
    CONSTRUCTOR,
    STATIC,
}

export interface MemberInfo {
    name: string;
    type: MemberType;
    index: number;
    valueType: ValueType | Type;
    optional?: boolean;
}

export interface ObjectMetaInfo {
    name: string;
    typeId: number;
    members: MemberInfo[];
}

export enum ClassMetaFlag {
   EXPORT = 1,
   DECLARE = 2,
   OBJECT_LITERAL = 4,
   BUILTIN = 8
}

export interface ClassMetaInfo {
    instance: ObjectMetaInfo;
    namespace: string;
    flags: number;
    clazz?: ObjectMetaInfo;
    base?: ClassMetaInfo;
    drivedClasses?: ClassMetaInfo[]; // drived class
}

export type VTableMember = number | string;

export interface VTable {
    meta: ObjectMetaInfo;
    members: VTableMember[];
}
