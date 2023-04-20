/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';
import {
    ValueType,
    ValueTypeKind,
    CustomTypeId,
    PrimitiveType,
    Primitive,
    ArrayType,
    SetType,
    MapType,
    UnionType,
    InterfaceType,
    ClassType,
    FunctionType,
    PredefinedTypeId,
} from './value_types.js';

import {
    GetPredefinedType,
} from './predefined_types.js';

import { DumpWriter, CreateDefaultDumpWriter } from './dump.js';

import {
    SemanticsValueKind,
    SemanticsValue,
    NopValue,
    VarValue,
    VarValueKind,
    ThisValue,
    SuperValue,
    LiteralValue,
    BinaryExprValue,
    PrefixUnaryExprValue,
    PostUnaryExprValue,
    ConditionExprValue,
    CastValue,
    NewClassValue,
    InstanceOfValue,
    ClassStaticValue,
    FunctionCallBaseValue,
    PropertySetValue,
    PropertySetValueKind,
    PropertyGetValue,
    PropertyGetValueKind,
    PropertyCallValue,
    PropertyCallValueKind,
    ElementSetValueKind,
    ElementSetValue,
    ElementGetValueKind,
    ElementGetValue,
    ElementCallValueKind,
    ElementCallValue,
    FunctionCallValue,
    GroupValue,
    ConstructorCallValue,
    ToStringValue,
    ValueBinaryOperator,
    NewClosureFunction,
    UnimplementValue,
} from './value.js';

import {
    SemanticsNode,
    SemanticsKind,
    FunctionDeclareNode,
    VarDeclareNode,
    ModuleNode
} from './semantics_nodes.js';

import {
    Expression,
    NullKeywordExpression,
    NumberLiteralExpression,
    StringLiteralExpression,
    ObjectLiteralExpression,
    ArrayLiteralExpression,
    FalseLiteralExpression,
    TrueLiteralExpression,
    IdentifierExpression,
    BinaryExpression,
    UnaryExpression,
    ConditionalExpression,
    CallExpression,
    SuperCallExpression,
    PropertyAccessExpression,
    NewExpression,
    ParenthesizedExpression,
    ElementAccessExpression,
    AsExpression,
    FunctionExpression,
}  from '../expression.js';

import {
    Scope,
    ScopeKind,
    ClassScope,
    FunctionScope
}  from '../scope.js';

import {
    Type,
    TSClass,
    TsClassField,
    TsClassFunc,
    FunctionKind,
    TypeKind,
    TSFunction,
    TSArray,
}  from '../type.js';

import { BuildContext, ValueReferenceKind, SymbolKeyToString } from './builder_context.js'; 
import {
    IsBuiltInType,
    IsBuiltInTypeButAny,
    IsBuiltInObjectType,
    GetBuiltInMemberType,
    createCollectionType,
} from './builtin.js';

import {
    ClassMetaInfo,
    ObjectMetaInfo,
    MemberInfo,
    MemberType,
    ClassMetaFlag,
    FindMemberFromMeta,
} from './runtime.js';

enum ValueObjectType {
  BUILTIN_OBJECT,
  CLASS_STATIC,
  CLASS_OBJECT,
  INTERFACE_OBJECT,
  SUPER_OBJECT,
  ANY_OBJECT,
}


function isInt(n : number) : boolean { return (n|0) === 0; } 

function toInt(n : number) : number {  return (n|0); }

function findMemberInfo(meta: ObjectMetaInfo, name: string) : MemberInfo | undefined {
  return meta.members.find(m => m.name == name);
}

function getMethodType(k: FunctionKind): MemberType {
    switch (k) {
        case FunctionKind.GETTER:
            return MemberType.GETTER;
        case FunctionKind.SETTER:
            return MemberType.SETTER;
        case FunctionKind.METHOD:
            return MemberType.METHOD;
    }
    return MemberType.METHOD;
}

export function createMeta(clazz: TSClass, context: BuildContext, isObjectLiteral: boolean = false): ClassMetaInfo {
    const module = context.module;
    const members: MemberInfo[] = [];
    const typeId = context.nextTypeId();

    let base : ClassMetaInfo | undefined = undefined;

    const base_class = clazz.getBase();
    if (base_class != null) {
      base = module.metas.get(base_class);
      if (!base) {
        base = createMeta(base_class, context, true);
      }
    }

    let i = 0;

    for (const f of clazz.fields) {
        members.push({
            name: f.name,
            type: MemberType.FIELD,
            index: i++,
	    valueType:  f.type // Update after processed types
        });
    }

    let ctr: TsClassFunc | undefined = undefined;
    const static_methods: MemberInfo[] = [];

    for (const m of clazz.memberFuncs) {
        if (m.type.funcKind == FunctionKind.CONSTRUCTOR) {
            ctr = m;
            continue;
        }

        if (m.type.funcKind == FunctionKind.STATIC) {
            static_methods.push({
                name: m.name,
                type: MemberType.STATIC,
                index: static_methods.length,
		valueType: m.type,
            });
            continue;
        }

        members.push({
            name: m.name,
            type: getMethodType(m.type.funcKind),
            index: i++,
	    valueType: m.type
        });
    }

    const instance_meta: ObjectMetaInfo = {
        name: clazz.className,
	typeId: typeId,
        members: members,
    };

    const class_meta: ClassMetaInfo = {
        instance: instance_meta,
	namespace: context.getScopeNamespace(),
	flags: isObjectLiteral ? ClassMetaFlag.OBJECT_LITERAL : 0,
	base: base
    };

    if (clazz.typeKind == TypeKind.CLASS) {
        i = 0;
        const static_members: MemberInfo[] = [];

        if (ctr) {
            static_members.push({
                name: '__ctr__',
                type: MemberType.CONSTRUCTOR,
                index: i++,
		valueType: ctr.type,
            });
        }

        for (const f of clazz.staticFields) {
            static_members.push({
                name: f.name,
                type: MemberType.FIELD,
                index: i++,
		valueType: f.type
            });
        }

        for (const m of static_methods) {
            static_members.push(m);
        }

        class_meta.clazz = {
            name: clazz.className,
	    typeId: typeId + 1,
            members: static_members,
        };
    }

    if (base && !isObjectLiteral) {
      if (base.drivedClasses) {
        base.drivedClasses.push(class_meta);
      } else {
        base.drivedClasses = [class_meta];
      }
    }
    
    module.metas.set(clazz, class_meta);
    return class_meta;
}

function getCollectionMeta(type: ValueType, tstype: Type|undefined, context: BuildContext) : ClassMetaInfo | undefined {
  const meta = createCollectionType(type);
  if (meta && tstype) {
    context.module.metas.set(tstype, meta);
  }

  console.log(`====== create meta for ${type} ${meta}`);

  return meta;
}

function createArrayType(context: BuildContext, element_type: ValueType, arr_type?: Type) : ValueType {
  const value_type = new ArrayType(context.nextTypeId(), element_type);
  value_type.class_meta = getCollectionMeta(value_type, arr_type, context);
  return value_type;
}

export function createType(context: BuildContext, type: Type, isObjectLiteral: boolean = false) : ValueType {
  const module = context.module;
  let value_type = module.findValueTypeByType(type);
  if (value_type) return value_type;  // do nothing

  switch(type.kind) {
    case TypeKind.CLASS:
      value_type = new ClassType(createMeta(type as TSClass, context, isObjectLiteral || (type as TSClass).isLiteral));
      break;
    case TypeKind.INTERFACE:
      value_type = new InterfaceType(createMeta(type as TSClass, context));
      break;
    case TypeKind.ARRAY:
    {
      const arr = type as TSArray;
      const element_type = createType(context, arr.elementType);
      value_type = createArrayType(context, element_type, arr);
      break;
    }
    case TypeKind.FUNCTION:
    {
      const func = type as TSFunction;
      const retType = createType(context, func.returnType);
      const params: ValueType[] = [];
      for (const p of func.getParamTypes()) {
	 params.push(createType(context, p));
      }

      value_type = new FunctionType(context.nextTypeId(), retType, params, func.hasRest());
      break;
    }
  }

  if (value_type) {
    context.module.types.set(type, value_type);
    context.module.typeByIds.set(value_type.typeId, value_type);
  } else {
    value_type = Primitive.Any;
  }

  context.globalSymbols.set(type, value_type!);

  return value_type!;
}

function GetMemberFromClassStatic(clazz: ClassType, name: string, as_write: boolean) : MemberInfo | undefined {
  const static_meta = clazz.class_meta.clazz;
  if (!static_meta) return undefined;
  
  return FindMemberFromMeta(static_meta, name, as_write);
}

function GetMemberFromClassInstance(clazz: ClassType, name: string, as_write: boolean) : MemberInfo | undefined {
  return FindMemberFromMeta(clazz.class_meta.instance, name, as_write);
}

function GetMemberFromInterface(intf: InterfaceType, name: string, as_write: boolean) : MemberInfo | undefined {
  return FindMemberFromMeta(intf.class_meta.instance, name, as_write);
}

function getPropertyValueKindFrom(refType: ValueReferenceKind, member_type: MemberType, obj_type: ValueObjectType) : SemanticsValueKind {
    switch(obj_type) {
      case ValueObjectType.BUILTIN_OBJECT:
        switch(member_type) {
           case MemberType.FIELD:
              return refType == ValueReferenceKind.LEFT
	                ? SemanticsValueKind.BUILTIN_SET_FIELD
			: SemanticsValueKind.BUILTIN_GET_FIELD;
	   case MemberType.GETTER:
	      return SemanticsValueKind.BUILTIN_GETTER;
	   case MemberType.SETTER:
	      return SemanticsValueKind.BUILTIN_SETTER;
           case MemberType.METHOD:
              return SemanticsValueKind.BUILTIN_METHOD_CALL;
        }
	break;
      case ValueObjectType.CLASS_STATIC:
        switch(member_type) {
           case MemberType.FIELD :
             return refType == ValueReferenceKind.LEFT
	                    ? SemanticsValueKind.CLASS_STATIC_SET_FIELD
			    : SemanticsValueKind.CLASS_STATIC_GET_FIELD;
           case MemberType.STATIC :
             return SemanticsValueKind.CLASS_STATIC_CALL;
        }
        break;
      case ValueObjectType.CLASS_OBJECT :
        switch(member_type) {
          case MemberType.FIELD :
            return refType == ValueReferenceKind.LEFT
	                  ? SemanticsValueKind.OBJECT_SET_FIELD
                          : SemanticsValueKind.OBJECT_GET_FIELD;
          case MemberType.GETTER :
             return SemanticsValueKind.OBJECT_GETTER;
          case MemberType.SETTER :
	     return SemanticsValueKind.OBJECT_SETTER;
          case MemberType.METHOD :
            return SemanticsValueKind.OBJECT_METHOD_CALL;
        }
	break;
      case ValueObjectType.INTERFACE_OBJECT :
        switch(member_type) {
	   case MemberType.FIELD :
              return refType == ValueReferenceKind.LEFT
	                       ?  SemanticsValueKind.INTERFACE_SET_FIELD
                               : SemanticsValueKind.INTERFACE_GET_FIELD;
           case MemberType.GETTER :
              return SemanticsValueKind.INTERFACE_GETTER;
           case MemberType.SETTER :
              return SemanticsValueKind.INTERFACE_SETTER;
           case MemberType.METHOD :
              return SemanticsValueKind.INTERFACE_METHOD_CALL;
       }
       break;
    }

    return SemanticsValueKind.INTERFACE_GET_FIELD; 
}

function buildPropertyAccessExpression(expr: PropertyAccessExpression, context: BuildContext) : SemanticsValue {
  context.pushReference(ValueReferenceKind.RIGHT);
  const own = buildExpression(expr.propertyAccessExpr, context);
  context.popReference();

  if (own.kind == SemanticsValueKind.NOP) {
    throw Error(`buildPropertyAccessExpression: Got NopValue`);
    return own;
  }

  const member_name = (expr.propertyExpr as IdentifierExpression).identifierName;

  const type = own.type;

  const ref_type = context.currentReference();
  const member_as_write = ref_type == ValueReferenceKind.LEFT;

  let member : MemberInfo | undefined = undefined;
  let own_obj_type = ValueObjectType.CLASS_OBJECT;
  if (IsBuiltInTypeButAny(type.kind)) {
    member = GetBuiltInMemberType(type, member_name, member_as_write);
    own_obj_type = ValueObjectType.BUILTIN_OBJECT;
  } else if (own.kind == SemanticsValueKind.CLASS_STATIC) {
    member = GetMemberFromClassStatic((own as ClassStaticValue).classType, member_name, member_as_write);
    own_obj_type = ValueObjectType.CLASS_STATIC;
  } else if (type.kind == ValueTypeKind.CLASS) {
    member = GetMemberFromClassInstance(type as ClassType, member_name, member_as_write);
    own_obj_type = ValueObjectType.CLASS_OBJECT;
  } else if (type.kind == ValueTypeKind.INTERFACE) {
    member = GetMemberFromInterface(type as InterfaceType, member_name, member_as_write);
    own_obj_type = ValueObjectType.INTERFACE_OBJECT;
  } else if (type.kind == ValueTypeKind.ANY) {
    if (ref_type == ValueReferenceKind.LEFT) {
      return new PropertySetValue(SemanticsValueKind.ANY_SET_FIELD, Primitive.Any, own, member_name);
    } else {
      return new PropertyGetValue(SemanticsValueKind.ANY_GET_FIELD, Primitive.Any, own, member_name);
    }
  } else {
    throw Error(`Unknow own type ${type} of ${own} in buildPropertyAccessExpression`);
    return new NopValue();
  }

  if (!member) {
    throw Error(`Cannot find the member "${member_name}" in ${own}`);
  }

  let value_kind = getPropertyValueKindFrom(ref_type, member!.type, own_obj_type);

  if (member!.type == MemberType.METHOD || member!.type == MemberType.STATIC) {
    const value_type = member!.valueType as ValueType;
    const func_type = value_type as FunctionType;
    return new PropertyCallValue(value_kind as PropertyCallValueKind, func_type.returnType, func_type, own, member!.index);
  }

  let result_type = member!.valueType;
  if (result_type.kind == ValueTypeKind.FUNCTION) {
    if (member!.type == MemberType.GETTER) {
      result_type = (result_type as FunctionType).returnType;
    }
    else if ( member!.type == MemberType.SETTER) {
      result_type = (result_type as FunctionType).argumentsType[0];
    }
  }

  if (ref_type == ValueReferenceKind.LEFT) {
    return new PropertySetValue(value_kind as PropertySetValueKind, result_type as ValueType, own, member!.index);
  } else {
    return new PropertyGetValue(value_kind as PropertyGetValueKind, result_type as ValueType, own, member!.index);
  }
}

function buildIdentiferExpression(expr: IdentifierExpression, context: BuildContext) : SemanticsValue {
  const name = expr.identifierName;

  const ret = context.findSymbol(name);
  if (ret instanceof SemanticsValue) return ret as SemanticsValue;

  if (ret instanceof FunctionDeclareNode) {
    const func_node = ret as FunctionDeclareNode;
    return new VarValue(SemanticsValueKind.GLOBAL_CONST,
			func_node.funcType,
			func_node,
			-1);
  }
  if (ret instanceof VarDeclareNode) {
    const var_decl = ret as VarDeclareNode;
    return new VarValue(var_decl.storageType as VarValueKind, 
			var_decl.type,
			var_decl,
			var_decl.index);
  }

  if (name == 'undefined') {
    return new LiteralValue(Primitive.Undefined, undefined);
  }

  throw Error(`Cannot find the idenentify "${name}"`);

  return new NopValue();
}

function buildObjectLiteralExpression(expr: ObjectLiteralExpression, context: BuildContext) : SemanticsValue {

  const type = expr.exprType as TSClass;
  let class_type = context.module.findValueTypeByType(type);
  if (!class_type) {
    class_type = createType(context, type, true);
  }

  if (expr.objectFields.length == 0)
    return new NewClassValue(class_type);


  const instance = (class_type as ClassType).class_meta.instance;

  const values : SemanticsValue[] = [];
  const temp_var = new VarValue(SemanticsValueKind.TEMPL_VAR, class_type, class_type, 0);
  values.push(newBinaryExprValue(class_type,
	              ts.SyntaxKind.EqualsToken,
		      temp_var,
                      new NewClassValue(class_type)));
  for (let i = 0; i < expr.objectFields.length; i ++) {
     const name = expr.objectFields[i].identifierName; 
     const m = findMemberInfo(instance, name);
     if (!m) {
       throw Error(`cannot find the field in object literal meta "${name}"`);
     }

     context.pushReference(ValueReferenceKind.RIGHT);
     const init_value = buildExpression(expr.objectValues[i], context);
     context.popReference();

     values.push(
	     new PropertySetValue(SemanticsValueKind.OBJECT_SET_FIELD,
                                  m.valueType as ValueType,
				  temp_var,
				  m.index,
				  init_value));
  }
  values.push(temp_var); // the last value

  return new GroupValue(class_type, values);
}

function buildArrayLiteralExpression(expr: ArrayLiteralExpression, context: BuildContext) : SemanticsValue {
  if (expr.arrayValues.length == 0) {
    return new NewClassValue(GetPredefinedType(PredefinedTypeId.ARRAY_ANY)!);
  }

  const init_values : SemanticsValue[] = [];

  for (const element of expr.arrayValues) {
    context.pushReference(ValueReferenceKind.RIGHT);
    const v = buildExpression(element, context);
    context.popReference();
    init_values.push(v);
  }

  let element_type = init_values[0].type;

  for (let i = 1; i < init_values.length; i ++) {
    if (!element_type.equals(init_values[i].type)) {
      element_type = GetPredefinedType(PredefinedTypeId.ANY)!;
      break;
    }
  }

  let array_type = context.module.findArrayValueType(element_type);
  if (!array_type) {
    // create array type
    array_type = createArrayType(context, element_type);
  }


  const temp_var = new VarValue(SemanticsValueKind.TEMPL_VAR, array_type, array_type, 0);

  const values : SemanticsValue[] = [];

  values.push(newBinaryExprValue(array_type,
	              ts.SyntaxKind.EqualsToken,
		      temp_var,
                      new NewClassValue(array_type)));

  let i = 0;
  for (const v of init_values) {
    context.pushReference(ValueReferenceKind.RIGHT);
    const p = new ElementSetValue(SemanticsValueKind.BUILTIN_INDEX_SET,
				   v.type,
                                   temp_var,
				   new LiteralValue(Primitive.Int, i++),
				   v);
    context.popReference();
    values.push(p);
  }

  values.push(temp_var);

  return new GroupValue(array_type, values);
}

function isEqualOperator(kind: ts.SyntaxKind) : boolean {
  return kind == ts.SyntaxKind.EqualsToken
      || kind == ts.SyntaxKind.PlusEqualsToken
      || kind == ts.SyntaxKind.MinusEqualsToken
      || kind == ts.SyntaxKind.AsteriskEqualsToken
      || kind == ts.SyntaxKind.AsteriskAsteriskEqualsToken
      || kind == ts.SyntaxKind.SlashEqualsToken
      || kind == ts.SyntaxKind.PercentEqualsToken
      || kind == ts.SyntaxKind.AmpersandEqualsToken
      || kind == ts.SyntaxKind.AmpersandAmpersandToken
      || kind == ts.SyntaxKind.BarEqualsToken
      || kind == ts.SyntaxKind.CaretEqualsToken
      ;
}

function isCompareOperator(kind: ts.SyntaxKind) : boolean {
  return kind == ts.SyntaxKind.LessThanEqualsToken
      || kind == ts.SyntaxKind.LessThanLessThanEqualsToken
      || kind == ts.SyntaxKind.LessThanToken
      || kind == ts.SyntaxKind.LessThanLessThanToken
      || kind == ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken
      || kind == ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken
      || kind == ts.SyntaxKind.GreaterThanGreaterThanEqualsToken
      || kind == ts.SyntaxKind.GreaterThanGreaterThanToken
      || kind == ts.SyntaxKind.GreaterThanEqualsToken
      || kind == ts.SyntaxKind.GreaterThanToken
      || kind == ts.SyntaxKind.EqualsEqualsToken
      || kind == ts.SyntaxKind.EqualsEqualsEqualsToken
      || kind == ts.SyntaxKind.ExclamationEqualsToken
      || kind == ts.SyntaxKind.ExclamationEqualsEqualsToken
      ;
}

function isObjectType(kind: ValueTypeKind) : boolean {
   return kind == ValueTypeKind.OBJECT
	|| kind == ValueTypeKind.ARRAY
        || kind == ValueTypeKind.SET
	|| kind == ValueTypeKind.MAP
	|| kind == ValueTypeKind.CLASS
	|| kind == ValueTypeKind.FUNCTION
	|| kind == ValueTypeKind.INTERSECTION;
}

export function newCastValue(type: ValueType, value: SemanticsValue) : SemanticsValue {
  if (type.equals(value.type))
    return value;

  if (type.kind == ValueTypeKind.RAW_STRING && value.type.kind == ValueTypeKind.STRING)
    return value;

  if (type.kind == ValueTypeKind.STRING && value.type.kind == ValueTypeKind.RAW_STRING)
    return value;

  if (type.kind == ValueTypeKind.STRING || type.kind == ValueTypeKind.RAW_STRING) {
     if (isObjectType(value.type.kind)) {
       return new ToStringValue(SemanticsValueKind.OBJECT_TO_STRING, value);
     }
     return new ToStringValue(SemanticsValueKind.VALUE_TO_STRING, value);
  }


  if (  type.kind == ValueTypeKind.INT
     || type.kind == ValueTypeKind.NUMBER
     || type.kind == ValueTypeKind.BOOLEAN) {
    if (value.type.kind == ValueTypeKind.NUMBER
	|| value.type.kind == ValueTypeKind.INT
	|| value.type.kind == ValueTypeKind.BOOLEAN
        || value.type.kind == ValueTypeKind.STRING
	|| value.type.kind == ValueTypeKind.RAW_STRING)
      return new CastValue(SemanticsValueKind.VALUE_CAST_VALUE, type, value);
    if (value.type.kind == ValueTypeKind.ANY)
      return new CastValue(SemanticsValueKind.ANY_CAST_VALUE, type, value);
    throw Error(`cannot make cast value from "${value.type}" to  "${type}"`);
  }

  if (type.kind == ValueTypeKind.NULL
      || type.kind == ValueTypeKind.UNDEFINED
      || type.kind == ValueTypeKind.NEVER) {
     if (value.type.kind == ValueTypeKind.ANY) {
       return new CastValue(SemanticsValueKind.ANY_CAST_VALUE, type, value);
     }
     throw Error(`cannot make cast value from "${value.type}" to  "${type}"`);
   }


  if (type.kind == ValueTypeKind.ANY) {
    if (isObjectType(value.type.kind))
      return new CastValue(SemanticsValueKind.OBJECT_CAST_ANY, type, value);
    if (value.type.kind == ValueTypeKind.UNION)
      return value;
    if (value.type.kind == ValueTypeKind.INTERFACE)
      return new CastValue(SemanticsValueKind.INTERFACE_CAST_ANY, type, value);
    return new CastValue(SemanticsValueKind.VALUE_CAST_ANY, type, value);
  }

  if (isObjectType(type.kind)) {
    if (isObjectType(value.type.kind))
      return new CastValue(SemanticsValueKind.OBJECT_CAST_OBJECT, type, value);
    
    if (value.type.kind == ValueTypeKind.INTERFACE) 
      return new CastValue(SemanticsValueKind.INTERFACE_CAST_OBJECT, type, value);
    if (value.type.kind == ValueTypeKind.ANY)
      return new CastValue(SemanticsValueKind.ANY_CAST_OBJECT, type, value);

    throw Error(`cannot make cast value from "${value.type}" to  "${type}"`);
  }

  if (type.kind == ValueTypeKind.INTERFACE) {
    if (isObjectType(value.type.kind))
      return new CastValue(SemanticsValueKind.OBJECT_CAST_INTERFACE, type, value);
    if (value.type.kind == ValueTypeKind.INTERFACE)
      return new CastValue(SemanticsValueKind.INTERFACE_CAST_INTERFACE, type, value);
    if (value.kind == SemanticsValueKind.CLASS_STATIC)
      return new CastValue(SemanticsValueKind.CLASS_CAST_INTERFACE, type, value);

    if (value.type.kind == ValueTypeKind.ANY)
      return new CastValue(SemanticsValueKind.ANY_CAST_INTERFACE, type, value);

  }

  throw Error(`cannot make cast value from "${value.type}" to  "${type}"`);
  return new NopValue();
}

function typeUp(up: ValueType, down: ValueType) : boolean {
  if (down.kind == ValueTypeKind.ANY) return true;

  if (up.kind == ValueTypeKind.NUMBER
      && (   down.kind == ValueTypeKind.INT
	  || down.kind == ValueTypeKind.BOOLEAN))
    return true;

  if (up.kind == ValueTypeKind.INT
      && ( down.kind == ValueTypeKind.BOOLEAN))
    return true;

  if (up.kind == ValueTypeKind.STRING || up.kind == ValueTypeKind.RAW_STRING)
    return true;

  return false;
}

function typeTranslate(type1: ValueType, type2: ValueType) : ValueType {
  if (type1.equals(type2)) return type1;	

  if (typeUp(type1, type2)) return type1;

  if (typeUp(type2, type1)) return type2;

  throw Error(`"${type1}" aginst of "${type2}"`);
}

export function newBinaryExprValue(type: ValueType|undefined, opKind: ValueBinaryOperator, left_value: SemanticsValue, right_value: SemanticsValue) : SemanticsValue {
  const is_equal = isEqualOperator(opKind);

  if (!left_value.type.equals(right_value.type)) {
    if (is_equal) {
      right_value = newCastValue(left_value.type, right_value);
      if (isPropertySetValue(left_value)) {
	return updateSetValue(left_value, right_value, opKind);
      }
    } else {
      console.log(`==== left: ${left_value}, right: ${right_value}`);
      const target_type = typeTranslate(left_value.type, right_value.type);
      //console.log(`====== target_type: ${target_type}`);
      if (!target_type.equals(left_value.type))
        left_value = newCastValue(target_type, left_value);
      if (!target_type.equals(right_value.type))
	right_value = newCastValue(target_type, right_value);
    }
  } else {
    if (is_equal && isPropertySetValue(left_value)) {
      return updateSetValue(left_value, right_value, opKind);
    }
  }

  let result_type = type ?? left_value.type;
  if (isCompareOperator(opKind)) {
    result_type = Primitive.Boolean;
  }

  return new BinaryExprValue(result_type, opKind, left_value, right_value);
}

function isPropertySetValue(v: SemanticsValue) : boolean {
  return  v.kind == SemanticsValueKind.OBJECT_SETTER
       || v.kind == SemanticsValueKind.OBJECT_SET_FIELD
       || v.kind == SemanticsValueKind.SUPER_SETTER
       || v.kind == SemanticsValueKind.SUPER_SET_FIELD
       || v.kind == SemanticsValueKind.INTERFACE_SETTER
       || v.kind == SemanticsValueKind.INTERFACE_SET_FIELD
       ;
}

function updateSetValue(left: SemanticsValue, right: SemanticsValue, op: ValueBinaryOperator) : SemanticsValue {
  if (left instanceof ElementSetValue) {
    const es = left as ElementSetValue;
    es.value = right;
    es.opKind = op;
  } else {
    const ps = left as PropertySetValue;
    ps.value = right;
    ps.opKind = op;
  }
  return left;
}


function buildBinaryExpression(expr: BinaryExpression, context: BuildContext) : SemanticsValue {
  const is_equal = isEqualOperator(expr.operatorKind);
  context.pushReference(is_equal
	            ? ValueReferenceKind.LEFT
		    : ValueReferenceKind.RIGHT)
  let left_value = buildExpression(expr.leftOperand, context);
  context.popReference();

  context.pushReference(ValueReferenceKind.RIGHT);
  let right_value = buildExpression(expr.rightOperand, context);
  context.popReference();

  return newBinaryExprValue(undefined, expr.operatorKind as ValueBinaryOperator, left_value, right_value);
}

function buildConditionalExpression(expr: ConditionalExpression, context: BuildContext) : SemanticsValue {
  context.pushReference(ValueReferenceKind.RIGHT);
  let condition = buildExpression(expr.condtion, context);
  condition = newCastValue(Primitive.Boolean, condition);
  context.popReference();

  context.pushReference(ValueReferenceKind.RIGHT);
  const true_value = buildExpression(expr.whenTrue, context);
  context.popReference();
  

  context.pushReference(ValueReferenceKind.RIGHT);
  const false_value = buildExpression(expr.whenFalse, context);
  context.popReference();

  let result_type = true_value.type;
  if (!result_type.equals(false_value.type)) {
    result_type = new UnionType(-1, [true_value.type, false_value.type]);
  }

  return new ConditionExprValue(result_type, condition, true_value, false_value);
}

function getCallValueTypeFrom(type: SemanticsValueKind) : SemanticsValueKind {
  switch(type) {
    case SemanticsValueKind.BUILTIN_GET_FIELD:
    case SemanticsValueKind.BUILTIN_GETTER:
      return SemanticsValueKind.BUILTIN_METHOD_CALL;
    case SemanticsValueKind.BUILTIN_INDEX_GET:
      return SemanticsValueKind.BUILTIN_INDEX_CALL;
    case SemanticsValueKind.BUILTIN_KEY_GET:
      return SemanticsValueKind.BUILTIN_KEY_CALL;

    case SemanticsValueKind.OBJECT_GET_FIELD:
    case SemanticsValueKind.OBJECT_GETTER:
      return SemanticsValueKind.OBJECT_METHOD_CALL;
    case SemanticsValueKind.OBJECT_INDEX_GET:
      return SemanticsValueKind.OBJECT_INDEX_CALL;
    case SemanticsValueKind.OBJECT_KEY_GET:
      return SemanticsValueKind.OBJECT_KEY_CALL;

    case SemanticsValueKind.INTERFACE_GET_FIELD:
    case SemanticsValueKind.INTERFACE_GETTER:
      return SemanticsValueKind.INTERFACE_METHOD_CALL;
    case SemanticsValueKind.INTERFACE_INDEX_GET:
      return SemanticsValueKind.INTERFACE_INDEX_CALL;
    case SemanticsValueKind.INTERFACE_KEY_GET:
      return SemanticsValueKind.INTERFACE_KEY_CALL;

    case SemanticsValueKind.CLASS_STATIC_GET_FIELD:
      return SemanticsValueKind.CLASS_STATIC_CALL;

    case SemanticsValueKind.SUPER_GET_FIELD:
    case SemanticsValueKind.SUPER_GETTER:
      return SemanticsValueKind.SUPER_METHOD_CALL;
    case SemanticsValueKind.SUPER_INDEX_GET:
      return SemanticsValueKind.SUPER_INDEX_CALL;
    case SemanticsValueKind.SUPER_KEY_GET:
      return SemanticsValueKind.SUPER_KEY_CALL;
  }

  return SemanticsValueKind.FUNCTION_CALL;
}

function getClassContructorType(clazzType?: ClassType) : FunctionType {
  if (!clazzType) return GetPredefinedType(PredefinedTypeId.FUNC_VOID_VOID)! as FunctionType;

  const clazz = clazzType!.class_meta;
  if (!(clazz!.clazz)) return GetPredefinedType(PredefinedTypeId.FUNC_VOID_VOID)! as FunctionType;

  const ctr = clazz!.clazz!.members.find((m) => {
    return m.name === '__ctr__';
  });

  return ctr ? ctr!.type! as unknown as FunctionType : GetPredefinedType(PredefinedTypeId.FUNC_VOID_VOID)! as FunctionType;
}

function buildCallExpression(expr: CallExpression, context: BuildContext) : SemanticsValue {
  context.pushReference(ValueReferenceKind.RIGHT);
  let func = buildExpression(expr.callExpr, context);

  if (func instanceof PropertyGetValue) {
    const p = func as PropertyGetValue;
    if (p.type.kind != ValueTypeKind.FUNCTION && p.type.kind != ValueTypeKind.ANY) {
      throw Error(`Property Access Result is not a function`);
    }
    const f_type = p.type.kind == ValueTypeKind.ANY
                 ? GetPredefinedType(PredefinedTypeId.FUNC_ANY_ARRAY_ANY) as FunctionType
	         : p.type as FunctionType;
    func = new PropertyCallValue(getCallValueTypeFrom(p.kind) as PropertyCallValueKind, f_type.returnType, f_type, p.owner, p.index);
  } else if (func instanceof ElementGetValue) {
    const e = func as ElementGetValue;
    if (e.type.kind != ValueTypeKind.FUNCTION && e.type.kind != ValueTypeKind.ANY) {
      throw Error(`Element Access Result is not a function`);
    }
    const f_type = e.type.kind == ValueTypeKind.ANY
                  ? GetPredefinedType(PredefinedTypeId.FUNC_ANY_ARRAY_ANY) as FunctionType
	          : e.type as FunctionType;
    func = new ElementCallValue(getCallValueTypeFrom(e.kind) as ElementCallValueKind, f_type.returnType, f_type, e.owner, e.index);
  } else {
    if (func.kind == SemanticsValueKind.SUPER) {  // create the super call
      const super_value = func as SuperValue;
      const ctr_type = getClassContructorType(super_value.type as ClassType);
      return new ConstructorCallValue(super_value, super_value.type as ClassType, ctr_type);
    } else if (func.type.kind == ValueTypeKind.FUNCTION) {
      const f_type = func.type as FunctionType;
      return new FunctionCallValue(SemanticsValueKind.FUNCTION_CALL, f_type.returnType, func, f_type);
    } else if (!(func.kind == SemanticsValueKind.CLASS_STATIC_CALL
	   || func.kind == SemanticsValueKind.BUILTIN_METHOD_CALL
	   || func.kind == SemanticsValueKind.BUILTIN_INDEX_CALL
	   || func.kind == SemanticsValueKind.BUILTIN_KEY_CALL
	   || func.kind == SemanticsValueKind.CLOSURE_CALL
           || func.kind == SemanticsValueKind.FUNCTION_CALL
	   || func.kind == SemanticsValueKind.OBJECT_METHOD_CALL
	   || func.kind == SemanticsValueKind.OBJECT_INDEX_CALL
	   || func.kind == SemanticsValueKind.OBJECT_KEY_CALL
	   || func.kind == SemanticsValueKind.ANY_GET_CALL
	   || func.kind == SemanticsValueKind.ANY_INDEX_CALL
	   || func.kind == SemanticsValueKind.ANY_KEY_CALL
	   || func.kind == SemanticsValueKind.INTERFACE_METHOD_CALL
	   || func.kind == SemanticsValueKind.INTERFACE_INDEX_CALL
	   || func.kind == SemanticsValueKind.INTERFACE_KEY_CALL
	   || func.kind == SemanticsValueKind.INTERFACE_CONSTRCTOR_CALL)) {
      throw Error(`unkown type for function call func kind: ${SemanticsValueKind[func.kind]}`);
    }
  }


  let params : SemanticsValue[] | undefined = undefined;
  // process the arguments
  if (expr.callArgs.length > 0) {
    params = [];
    for (const arg of expr.callArgs) {
      params.push(buildExpression(arg, context));
    }

    (func as FunctionCallBaseValue).parameters = params;
  }
  context.popReference();

  return func;
}

function buildNewExpression(expr: NewExpression, context: BuildContext) : SemanticsValue {

  context.pushReference(ValueReferenceKind.RIGHT);
  const class_type = context.module.findValueTypeByType(expr.exprType);
  if (!class_type)
    throw Error(`cannot find the new class`);

  const params = expr.newArgs;
  let arg_values : SemanticsValue[] | undefined = undefined;
  const temp_var = new VarValue(SemanticsValueKind.TEMPL_VAR, class_type, class_type, 0);
  const values : SemanticsValue[] = [];

  values.push(newBinaryExprValue(class_type,
	              ts.SyntaxKind.EqualsToken,
		      temp_var,
                      new NewClassValue(class_type)));

  if (params && params.length > 0) {
    arg_values = [];
    for (const p of params)
      arg_values!.push(buildExpression(p, context));
  }
  
  values.push(new ConstructorCallValue(temp_var, class_type as ClassType, getClassContructorType(class_type as ClassType), arg_values));
  values.push(temp_var);

  context.popReference();

  return new GroupValue(class_type, values);
}

function buildAsExpression(expr: AsExpression, context: BuildContext) : SemanticsValue {
  context.pushReference(ValueReferenceKind.RIGHT);
  const right = buildExpression(expr.expression, context);
  context.popReference();
  const value_type = context.module.findValueTypeByType(expr.exprType);
  if (!value_type) {
    throw Error(`Unknow Type for AsExpression: ${SymbolKeyToString(expr.exprType)}`);
  }

  return newCastValue(value_type, right);
}

function getElementValueKindFrom(refType: ValueReferenceKind, is_index: boolean, obj_type: ValueObjectType) : SemanticsValueKind {
    switch(obj_type) {
      case ValueObjectType.BUILTIN_OBJECT:
          if (is_index)
              return refType == ValueReferenceKind.LEFT
	                ? SemanticsValueKind.BUILTIN_INDEX_SET
			: SemanticsValueKind.BUILTIN_INDEX_GET;
           else
              return refType == ValueReferenceKind.LEFT
	                ? SemanticsValueKind.BUILTIN_KEY_SET
                        : SemanticsValueKind.BUILTIN_KEY_GET;
	break;
      case ValueObjectType.CLASS_OBJECT :
        if(is_index)
            return refType == ValueReferenceKind.LEFT
	                  ? SemanticsValueKind.OBJECT_INDEX_SET
                          : SemanticsValueKind.OBJECT_INDEX_GET;
	else
            return refType == ValueReferenceKind.LEFT
	                   ? SemanticsValueKind.OBJECT_KEY_SET
                           : SemanticsValueKind.OBJECT_KEY_GET;
	break;
      case ValueObjectType.INTERFACE_OBJECT :
        if(is_index)
              return refType == ValueReferenceKind.LEFT
	                       ? SemanticsValueKind.INTERFACE_INDEX_SET
                               : SemanticsValueKind.INTERFACE_INDEX_GET;
        else
              return refType == ValueReferenceKind.LEFT
	                     ? SemanticsValueKind.INTERFACE_KEY_SET
                             : SemanticsValueKind.INTERFACE_KEY_GET;
       break;
       case ValueObjectType.ANY_OBJECT:
	if (is_index)
              return refType == ValueReferenceKind.LEFT
	                       ? SemanticsValueKind.ANY_INDEX_SET
			       : SemanticsValueKind.ANY_INDEX_GET;
        else
	      return refType == ValueReferenceKind.LEFT
                               ? SemanticsValueKind.ANY_KEY_SET
			       : SemanticsValueKind.ANY_KEY_GET;
    }

    return SemanticsValueKind.INTERFACE_GET_FIELD; 
}


function buildElementAccessExpression(expr: ElementAccessExpression, context: BuildContext) : SemanticsValue {
  context.pushReference(ValueReferenceKind.RIGHT);
  const own = buildExpression(expr.accessExpr, context);
  let arg = buildExpression(expr.argExpr, context);
  context.popReference();

  let is_index =  arg.type.kind == ValueTypeKind.NUMBER
                 || arg.type.kind == ValueTypeKind.INT;

  const type = own.type;
  let own_obj_type = ValueObjectType.CLASS_OBJECT;
  if (IsBuiltInTypeButAny(type.kind)) {
    own_obj_type = ValueObjectType.BUILTIN_OBJECT;
  } else if (own.kind == SemanticsValueKind.CLASS_STATIC) {
    own_obj_type = ValueObjectType.CLASS_STATIC;
  } else if (type.kind == ValueTypeKind.CLASS) {
    own_obj_type = ValueObjectType.CLASS_OBJECT;
  } else if (type.kind == ValueTypeKind.INTERFACE) {
    own_obj_type = ValueObjectType.INTERFACE_OBJECT;
  } else if (type.kind == ValueTypeKind.ANY) {
    own_obj_type = ValueObjectType.ANY_OBJECT;
  } else {
    throw Error(`Unknow type ${type} of ${own} in buildElementAccessExpression`);
    return new NopValue();
  }

  let value_type : ValueType = Primitive.Any;
  if (own.type.kind == ValueTypeKind.ARRAY) {
    value_type = (own.type as ArrayType).element;
    is_index = true;
    arg = newCastValue(Primitive.Int, arg);
  } else if (own.type.kind == ValueTypeKind.SET) {
    value_type = (own.type as SetType).element;
  } else if (own.type.kind == ValueTypeKind.MAP) {
    const map_type = (own.type as MapType);
    value_type = map_type.value;
    arg = newCastValue(map_type.key, arg);
  } else if (own.type.kind == ValueTypeKind.CLASS
             || own.type.kind == ValueTypeKind.OBJECT) {
    // asscess tye key
    value_type = Primitive.Any;
    arg = newCastValue(Primitive.String, arg);
    is_index = false;
  } else if (own.type.kind == ValueTypeKind.INTERFACE) {
    // is index access defined ?
    //TODO if (has_index_access?) {
    //} else {
      value_type = Primitive.Any;
      arg = newCastValue(Primitive.String, arg);
      is_index = false;
    // }
  } else if (own.type.kind == ValueTypeKind.UNION) {
    // TODO get the common type of union

    is_index = false;
  }

  const ref_type = context.currentReference();
  const access_kind = getElementValueKindFrom(ref_type, is_index, own_obj_type);
  if (ref_type == ValueReferenceKind.LEFT) {
    return new ElementSetValue(access_kind as ElementSetValueKind, value_type, own, arg);

  } else {
    return new ElementGetValue(access_kind as ElementGetValueKind, value_type, own, arg);
  }
}

function getCurrentClassType(context: BuildContext) : TSClass | undefined {
  let scope : Scope | null = context.top().scope;

  while(scope != null && scope.kind != ScopeKind.ClassScope) {
    scope = scope.parent ? scope.parent : null;
  }

  if (scope) return (scope as ClassScope).classType;

  return undefined;
}

function buildThisValue(context: BuildContext) : SemanticsValue {
  const clazz = getCurrentClassType(context);
  if (clazz) {
    const clazz_type = context.module.findValueTypeByType(clazz);
    if (!clazz_type)
      throw Error(`Cannot find the class type of ${clazz.mangledName}`);
    return new ThisValue(clazz_type as ClassType);
  } else {
    // TODO Error
    throw Error("cannot find the this in context");
  }

  return new NopValue();
}

function buildSuperValue(context: BuildContext) : SemanticsValue {
  const clazz = getCurrentClassType(context);
  if (!clazz) {
    throw Error("cannot find the current class type for super");
  }

  const super_class = clazz!.getBase();
  if (!super_class) {
    throw Error(`class "${clazz.mangledName}" has no super type`);
  }

  const super_class_type = context.module.findValueTypeByType(super_class!);
  if (!super_class_type)
    throw Error(`super class type of "${super_class.mangledName}" cannot be bound`);

  return new SuperValue(super_class_type! as ClassType);
}

function buildUnaryExpression(expr: UnaryExpression, context: BuildContext) : SemanticsValue {
  context.pushReference(ValueReferenceKind.RIGHT);
  const operand = buildExpression(expr.operand, context);
  context.popReference();

  if (expr.operatorKind == ts.SyntaxKind.PrefixUnaryExpression)
    return new PrefixUnaryExprValue(operand.type as PrimitiveType, expr.operatorKind as ts.PrefixUnaryOperator, operand);
  return new PostUnaryExprValue(operand.type as PrimitiveType, expr.operatorKind as ts.PostfixUnaryOperator, operand);
}

function buildFunctionExpression(expr: FunctionExpression, context: BuildContext) : SemanticsValue {
  const func = context.globalSymbols.get(expr.funcScope);
  if (!func || !(func instanceof SemanticsNode) || (func! as SemanticsNode).kind != SemanticsKind.FUNCTION) {
    throw Error(`Cannot found the function ${expr.funcScope.funcName}`);
  }

  const func_node = (func as SemanticsNode) as FunctionDeclareNode;

  // new Closure Function
  return new NewClosureFunction(func_node);
}

export function buildExpression(expr: Expression, context: BuildContext) : SemanticsValue {

   console.log(`======= buildExpression: ${ts.SyntaxKind[expr.expressionKind]}`);
   try {
     switch(expr.expressionKind) {
       case ts.SyntaxKind.PropertyAccessExpression:
         return buildPropertyAccessExpression(expr as PropertyAccessExpression, context);
       case ts.SyntaxKind.Identifier:
         return buildIdentiferExpression(expr as IdentifierExpression, context);
  
       case ts.SyntaxKind.NullKeyword:
         return new LiteralValue(Primitive.Null, null);
       case ts.SyntaxKind.UndefinedKeyword:
	 return new LiteralValue(Primitive.Undefined, undefined);
       case ts.SyntaxKind.NumericLiteral:
         {
  	 const n = (expr as NumberLiteralExpression).expressionValue;
  	 if (isInt(n))
             return new LiteralValue(Primitive.Int, toInt(n));
           return new LiteralValue(Primitive.Number, n);
         }
       case ts.SyntaxKind.StringLiteral:
         return new LiteralValue(Primitive.RawString, (expr as StringLiteralExpression).expressionValue);
       case ts.SyntaxKind.TrueKeyword:
         return new LiteralValue(Primitive.Boolean, true);
       case ts.SyntaxKind.FalseKeyword:
         return new LiteralValue(Primitive.Boolean, false);
       case ts.SyntaxKind.ObjectLiteralExpression:
         return buildObjectLiteralExpression(expr as ObjectLiteralExpression, context);
       case ts.SyntaxKind.ArrayLiteralExpression:
         return buildArrayLiteralExpression(expr as ArrayLiteralExpression, context);
       case ts.SyntaxKind.BinaryExpression:
         return buildBinaryExpression(expr as BinaryExpression, context);
       case ts.SyntaxKind.ConditionalExpression:
         return buildConditionalExpression(expr as ConditionalExpression, context);
       case ts.SyntaxKind.CallExpression:
         return buildCallExpression(expr as CallExpression, context);
       case ts.SyntaxKind.SuperKeyword:
         return buildSuperValue(context);
       case ts.SyntaxKind.ThisKeyword:
         return buildThisValue(context);
       case ts.SyntaxKind.NewExpression:
         return buildNewExpression(expr as NewExpression, context);
       case ts.SyntaxKind.ElementAccessExpression:
         return buildElementAccessExpression(expr as ElementAccessExpression, context);
       case ts.SyntaxKind.AsExpression:
         return buildAsExpression(expr as AsExpression, context);
       case ts.SyntaxKind.FunctionExpression:
       case ts.SyntaxKind.ArrowFunction:
         return buildFunctionExpression(expr as FunctionExpression, context);
       case ts.SyntaxKind.ParenthesizedExpression:
         return buildExpression((expr as ParenthesizedExpression).parentesizedExpr, context);
       case ts.SyntaxKind.PrefixUnaryExpression:
       case ts.SyntaxKind.PostfixUnaryExpression:
         return buildUnaryExpression(expr as UnaryExpression, context);
     }
     return new UnimplementValue(expr.tsNode!);
   }
   catch(e: any)
   {
     console.log(e.message);
     console.log(e.stack);
     const tsNode = expr.tsNode!;
     const sourceFile = tsNode.getSourceFile();
     const start = tsNode.getStart(sourceFile);
     const startLineInfo = sourceFile.getLineAndCharacterOfPosition(start);
     console.log(`[ERROR] @ "${sourceFile.fileName}" line: ${startLineInfo.line + 1} @${startLineInfo.character}  end: ${tsNode.getEnd()}  width: ${tsNode.getWidth(sourceFile)}`);
     console.log(`Source: ${tsNode.getFullText(sourceFile)}`);
   }

   return new NopValue();
}
