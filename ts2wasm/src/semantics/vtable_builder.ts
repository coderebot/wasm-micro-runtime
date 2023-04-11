/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';
import {
    ClassMetaInfo,
    ObjectMetaInfo,
    MemberInfo,
    MemberType,
    VTable,
    VTableMember,
    ClassMetaFlag,
} from './runtime.js';

import {
    SemanticsKind,
    SemanticsNode,
    ModuleNode,
    VarDeclareNode,
    VarStorageType,
    EmptyNode,
    BasicBlockNode,
    BlockNode,
    FunctionDeclareNode,
    FunctionOwnKind,
    IfNode,
    ForNode,
    WhileNode,
    CaseClauseNode,
    DefaultClauseNode,
    SwitchNode,
    ReturnNode,
    BreakNode,
    ContinueNode,
} from './semantics_nodes.js';

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
    ClosureCallValue,
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
    ValueType,
    ValueTypeKind,
    ClassType,
    InterfaceType,
    FunctionType,
    Primitive,
} from './value_types.js';

import { newBinaryExprValue } from './expression_builder.js';

function findVTable(from: ClassType, to: ClassType, module: ModuleNode) : VTable | undefined {
  const vtables = module.vtables.get(to.typeId);
  if (!vtables) return undefined;

  return vtables.find((v) => v.meta.typeId == from.typeId);
}

function insertVTable(typeId: number, vtable: VTable, module: ModuleNode) {
  const vtables = module.vtables.get(typeId);
  if (!vtables) {
    module.vtables.set(typeId, [vtable]);
    return;
  }
  vtables.push(vtable);
}

function buildInstanceVTable(classType: ClassType, module: ModuleNode) : VTable {
  const found_vtable = findVTable(classType, classType, module);
  if (found_vtable) return found_vtable;

  // create vtable
  const vtable_members : VTableMember[] = [];

  const instance_meta = classType.class_meta.instance;
  const class_name = `${classType.class_meta.namespace}|${instance_meta.name}`;

  for (const m of instance_meta.members) {
    if (m.type == MemberType.FIELD) {
       vtable_members.push(m.index);
    }  else {
       vtable_members.push(`${class_name}_${m.name}`); // method name
    }
  }

  const vtable : VTable = {
    meta: instance_meta,
    members: vtable_members 
  }

  // insert into vtable
  insertVTable(classType.typeId, vtable, module);

  return vtable;
}

function findMember(meta: ObjectMetaInfo, name: string) : MemberInfo | undefined {
  return meta.members.find((m) => m.name == name);
}

function createMemberAccessor(name: string, type: MemberType, classType: ClassType,  field: MemberInfo, module: ModuleNode) {

  const this_param = new VarDeclareNode(
	              SemanticsValueKind.PARAM_VAR,
		      classType,
		      '@this',
		      0, 0);
  const this_value = new ThisValue(classType);
  if (type == MemberType.GETTER) {
    const func_type = new FunctionType(-1, field.valueType as ValueType,
			[classType], false); 
    const value = new PropertyGetValue(SemanticsValueKind.OBJECT_GET_FIELD,
				       field.valueType as ValueType,
                                       this_value,
				       field.index);

    const return_stmt = new ReturnNode(value);
    const func = new FunctionDeclareNode(name, FunctionOwnKind.METHOD,
					 func_type,
                                         new BlockNode([return_stmt]),
					 [this_param]);
    module.functions.push(func);
  } else {
    const val_param_decl = new VarDeclareNode(
	                  SemanticsValueKind.PARAM_VAR,
			  field.valueType as ValueType,
			  'value',
			  1, 0);
    const val_param = new VarValue(SemanticsValueKind.PARAM_VAR,
				   field.valueType as ValueType,
                                   val_param_decl,
				   1);
    const func_type = new FunctionType(-1, Primitive.Void,
				       [classType, field.valueType as ValueType],
                                       false);
    const value = new PropertySetValue(SemanticsValueKind.OBJECT_SET_FIELD,
				       field.valueType as ValueType,
                                       this_value,
				       field.index,
				       val_param);

    const block = new BasicBlockNode();
    block.pushSemanticsValue(value);
    const func = new FunctionDeclareNode(name, FunctionOwnKind.METHOD,
					 func_type,
                                         new BlockNode([block]),
					 [this_param, val_param_decl]);
				       
    module.functions.push(func);
  }

  return name;
}

function buildInterfaceVTable(from: ClassType|InterfaceType, to: ClassType|InterfaceType, module: ModuleNode) : VTable | undefined {
  // compiler known the from class
  const from_meta = from.class_meta;
  const to_meta = to.class_meta;

  const from_name = `${from_meta.namespace}|${from_meta.instance.name}`;
  const to_name = `${to_meta.namespace}|${to_meta.instance.name}`;

  if (from.kind == ValueTypeKind.INTERFACE) {
    console.log(`[WARNING] ${from_name} is interface, must dynamic_cast`);
    return undefined; // must call dynamic_interface_cast
  }

  if ((from_meta.flags & ClassMetaFlag.OBJECT_LITERAL) == 0
      || (from_meta.flags & ClassMetaFlag.DECLARE) != 0
      || (from_meta.flags & ClassMetaFlag.EXPORT) != 0
      || (from_meta.drivedClasses && from_meta.drivedClasses.length > 0)) {
    console.log(`[WARNING] cannot found ${from_name}'s class implements (flags=${from_meta.flags}), must dynamic_cast`);
    return undefined; // must call dynamic_interface_cast
  }


  const found_vtable = findVTable(from, to, module);
  if (found_vtable) return found_vtable;

  // try make vtable
  const vtable_members: VTableMember[] = [];
  for (const to_m of to_meta.instance.members) {
    const from_m = findMember(from_meta.instance, to_m.name);
    if (!from_m) {
      if (to_m.optional == undefined || to_m.optional) {
        vtable_members.push(-1); // undefined member
      } else {
        throw Error(`Cannot find the member "${to_m.name}" when cast from "${from_name}" to "${to_name}"`);
      }
      continue;
    }

    if (from_m!.type == to_m.type) {
      if (to_m.type == MemberType.FIELD) {
        vtable_members.push(from_m!.index);
      } else {
        vtable_members.push(`${from_name}_${from_m!.name}`);
      }
    } else if ((to_m.type == MemberType.GETTER || to_m.type == MemberType.SETTER)
	       && from_m!.type == MemberType.FIELD) {
      vtable_members.push(createMemberAccessor(`${to_name}|${to_m.name}`, to_m.type, from, from_m!, module));
    } else {
       throw Error(`Unmatched member type of "${to_m.name}" when cast from "${from_name}" to "${to_name}": from member type: ${MemberType[from_m!.type]} to member type: ${MemberType[to_m.type]}`);
    }
  }
  
  const vtable : VTable = {
    meta: from_meta.instance,
    members: vtable_members
  }

  insertVTable(to.typeId, vtable, module);

  return vtable;
}

function createNewConstructor(name: string, classType: ClassType, module: ModuleNode) : string {
  const params_decl : VarDeclareNode[] = [];
  const params_values: VarValue[] = [];

  if (!classType.class_meta.clazz) {
    throw Error(`class (${classType.typeId})(${classType.class_meta.namespace}|${classType.class_meta.instance.name}) no class information`);
  }

  const ctr_member = classType.class_meta.clazz!.members.find((m) => m.name == '__ctr__');
  if (!ctr_member) {
    throw Error(`class (${classType.typeId})(${classType.class_meta.namespace}|${classType.class_meta.instance.name}) no constructor`);
  }

  const ctr_type = ctr_member!.valueType as ValueType;
  const ctr_func = ctr_type as FunctionType;

  // get parameters
  let i = 0;
  for (const p of ctr_func.argumentsType) {
    const decl = new VarDeclareNode(SemanticsValueKind.PARAM_VAR,
				    p, `arg$i`, i, 0);
    const param = new VarValue(SemanticsValueKind.PARAM_VAR, p, decl, i);
    params_decl.push(decl);
    params_values.push(param);
  }

  const new_ctr_func = new FunctionType(-1, classType, ctr_func.argumentsType, ctr_func.hasRest);
  
  const self_decl = new VarDeclareNode(SemanticsValueKind.LOCAL_CONST,
				       classType, 'self', 0, 0);
  const self_val = new VarValue(SemanticsValueKind.LOCAL_CONST,
				classType, self_decl, self_decl.index);

  const basic_block = new BasicBlockNode();
  basic_block.pushSemanticsValue(newBinaryExprValue(classType,
				ts.SyntaxKind.EqualsToken,
				self_val,
				new NewClassValue(classType)));
  basic_block.pushSemanticsValue(new ConstructorCallValue(self_val,
				classType, ctr_func, params_values));

  const return_stmt = new ReturnNode(self_val);
  const block = new BlockNode([basic_block, return_stmt], [self_decl]);

  const func = new FunctionDeclareNode(name,
				       FunctionOwnKind.DEFAULT,
                                       new_ctr_func,
				       block,
				       params_decl);
  // TODO avoid same value
  module.functions.push(func);

  return name;
}

function createDefaultNewConstructor(name: string, classType: ClassType, module: ModuleNode) : string {
  const ctr_func = new FunctionType(-1, classType, [Primitive.Void], false);

  const new_value = new NewClassValue(classType);
  const return_stmt = new ReturnNode(new_value); 

  const block = new BlockNode([return_stmt]);

  const func = new FunctionDeclareNode(name, FunctionOwnKind.DEFAULT,
				       ctr_func,
                                       block);

  module.functions.push(func);

  return name;
}

function buildClassInterfaceVTable(from: ClassType, to: ClassType|InterfaceType, module: ModuleNode) : VTable | undefined {
  if (from.kind != ValueTypeKind.CLASS) {
    //const name = `${from.class_meta.namespace}|${from.class_meta.instance.name}`;
    throw Error(`Class Interface must be a class type: ${ValueTypeKind[from.kind]}`);
  }

  const class_meta = from.class_meta;
  const intf_meta = to.class_meta;
  
  let ctr : string | undefined = undefined;

  const from_name = `${class_meta.namespace}|${class_meta.instance.name}`;
  const to_name = `${intf_meta.namespace}|${intf_meta.instance.name}`;

  const vtable_members: VTableMember[] = [];
  for (const intf_m of intf_meta.instance.members) {
    const class_m = findMember(class_meta.clazz!, intf_m.name);
    if (!class_m) {
      if (intf_m.name == '__ctr__') { // constructor
          vtable_members.unshift(createDefaultNewConstructor(`${from_name}_ctr`, from, module));
      } else if (intf_m.optional == undefined || intf_m.optional) {
        vtable_members.push(-1);
      } else {
        throw Error(`Unmatched ClassInterface member "${intf_m.name}" when cast from "${from_name}" to "${to_name}"`);
      }
    } else {
      if (intf_m.name == '__ctr__') {
        vtable_members.unshift(createNewConstructor(`${from_name}_ctr`, from, module));
      } else {
        if (class_m!.type == intf_m.type) {
           if (intf_m.type == MemberType.FIELD) {
             vtable_members.push(class_m!.index);
  	   } else {
             vtable_members.push(`${from_name}_${class_m!.name}`);
	   }
	}
      }
    }
  }

  const vtable : VTable = {
    meta : class_meta.instance,
    members: vtable_members
  }

  insertVTable(to.typeId, vtable, module);

  return vtable;
}


function buildVTableOfStatements(statements: SemanticsNode[], module: ModuleNode) {
   for (const s of statements)
     buildVTableOfStatement(s, module);
}

function buildVTableOfValues(values: SemanticsValue[], module: ModuleNode) {
   for (const v of values)
     buildVTableOfValue(v, module);
}

function buildVTableOfValue(value: SemanticsValue, module: ModuleNode) {
  console.log(`===== buildVTable from Value: ${SemanticsValueKind[value.kind]}`);
  switch(value.kind) {
    case SemanticsValueKind.NEW_CLASS:
      buildInstanceVTable(value.type as ClassType, module);
      break;
    case SemanticsValueKind.INTERFACE_CAST_INTERFACE:
    case SemanticsValueKind.INTERFACE_CAST_OBJECT:
      buildVTableOfValue((value as CastValue).value, module);
      break; // must call dynamic_cast
    case SemanticsValueKind.OBJECT_CAST_INTERFACE:
    case SemanticsValueKind.OBJECT_CAST_OBJECT:
      buildInterfaceVTable((value as CastValue).value.type as ClassType, value.type as ClassType, module);
      buildVTableOfValue((value as CastValue).value, module);
      break;
    case SemanticsValueKind.CLASS_CAST_INTERFACE:
      buildClassInterfaceVTable((value as CastValue).value.type as ClassType, value.type as ClassType, module);
      break;
    case SemanticsValueKind.VALUE_CAST_ANY:
    case SemanticsValueKind.VALUE_CAST_VALUE:
    case SemanticsValueKind.OBJECT_CAST_ANY:
    case SemanticsValueKind.INTERFACE_CAST_ANY:
    case SemanticsValueKind.ANY_CAST_VALUE:
    case SemanticsValueKind.ANY_CAST_INTERFACE:
    case SemanticsValueKind.ANY_CAST_OBJECT:
    case SemanticsValueKind.ANY_CAST_VALUE:
      buildVTableOfValue((value as CastValue).value, module);
      break;
    case SemanticsValueKind.INTERFACE_INSTANCE_OF:
    case SemanticsValueKind.OBJECT_INSTANCE_OF:
      buildVTableOfValue((value as InstanceOfValue).value, module);
      break;
    case SemanticsValueKind.GROUP_VALUE:
      buildVTableOfValues((value as GroupValue).values, module);
      break;
    case SemanticsValueKind.BINARY_EXPR:
      buildVTableOfValue((value as BinaryExprValue).left, module);
      buildVTableOfValue((value as BinaryExprValue).right, module);
      break;
    case SemanticsValueKind.PRE_UNARY_EXPR:
      buildVTableOfValue((value as PrefixUnaryExprValue).target, module);
      break;
    case SemanticsValueKind.POST_UNARY_EXPR:
      buildVTableOfValue((value as PostUnaryExprValue).target, module);
      break;
    case SemanticsValueKind.CONDITION_EXPR:
      buildVTableOfValue((value as ConditionExprValue).condition, module);
      buildVTableOfValue((value as ConditionExprValue).trueExpr, module);
      buildVTableOfValue((value as ConditionExprValue).falseExpr, module);
      break;
    case SemanticsValueKind.FUNCTION_CALL:
    case SemanticsValueKind.SUPER_CALL:
      buildVTableOfValue((value as FunctionCallValue).func, module);
      if ((value as FunctionCallValue).parameters)
        buildVTableOfValues((value as FunctionCallValue).parameters!, module);
      break;
    case SemanticsValueKind.CLOSURE_CALL:
      buildVTableOfValue((value as ClosureCallValue).func, module);
      if ((value as ClosureCallValue).parameters)
        buildVTableOfValues((value as ClosureCallValue).parameters!, module);
      break;
    case SemanticsValueKind.INTERFACE_CONSTRCTOR_CALL:
      if ((value as ConstructorCallValue).parameters)
        buildVTableOfValues((value as ConstructorCallValue).parameters!, module);
      break;
    case SemanticsValueKind.OBJECT_METHOD_CALL:
    case SemanticsValueKind.INTERFACE_METHOD_CALL:
    case SemanticsValueKind.CLASS_STATIC_CALL:
    case SemanticsValueKind.SUPER_METHOD_CALL:
    case SemanticsValueKind.BUILTIN_METHOD_CALL:
      buildVTableOfValue((value as PropertyCallValue).owner, module);
      if ((value as PropertyCallValue).parameters)
        buildVTableOfValues((value as PropertyCallValue).parameters!, module);
      break;
    case SemanticsValueKind.BUILTIN_INDEX_CALL:
    case SemanticsValueKind.BUILTIN_KEY_CALL:
    case SemanticsValueKind.OBJECT_INDEX_CALL:
    case SemanticsValueKind.OBJECT_KEY_CALL:
    case SemanticsValueKind.INTERFACE_INDEX_CALL:
    case SemanticsValueKind.INTERFACE_KEY_CALL:
    case SemanticsValueKind.SUPER_INDEX_CALL:
    case SemanticsValueKind.SUPER_KEY_CALL:
      buildVTableOfValue((value as ElementCallValue).owner, module);
      buildVTableOfValue((value as ElementCallValue).index, module);
      if ((value as ElementCallValue).parameters)
        buildVTableOfValues((value as ElementCallValue).parameters!, module);
      break;
    case SemanticsValueKind.OBJECT_GETTER:
    case SemanticsValueKind.INTERFACE_GETTER:
    case SemanticsValueKind.SUPER_GETTER:
    case SemanticsValueKind.OBJECT_GET_FIELD:
    case SemanticsValueKind.INTERFACE_GET_FIELD:
    case SemanticsValueKind.SUPER_GET_FIELD:
    case SemanticsValueKind.INDEX_ELEMENT_GET:
    case SemanticsValueKind.KEY_ELEMENT_GET:
      buildVTableOfValue((value as PropertyGetValue).owner, module);
      break;
    case SemanticsValueKind.BUILTIN_INDEX_GET:
    case SemanticsValueKind.BUILTIN_KEY_GET:
    case SemanticsValueKind.OBJECT_INDEX_GET:
    case SemanticsValueKind.OBJECT_KEY_GET:
    case SemanticsValueKind.INTERFACE_INDEX_GET:
    case SemanticsValueKind.INTERFACE_KEY_GET:
    case SemanticsValueKind.SUPER_INDEX_GET:
    case SemanticsValueKind.SUPER_KEY_GET:
      buildVTableOfValue((value as ElementGetValue).owner, module);
      buildVTableOfValue((value as ElementGetValue).index, module);
      break;
    case SemanticsValueKind.OBJECT_SETTER:
    case SemanticsValueKind.INTERFACE_SETTER:
    case SemanticsValueKind.SUPER_SETTER:
    case SemanticsValueKind.OBJECT_SET_FIELD:
    case SemanticsValueKind.INTERFACE_SET_FIELD:
    case SemanticsValueKind.SUPER_SET_FIELD:
    case SemanticsValueKind.INDEX_ELEMENT_SET:
    case SemanticsValueKind.KEY_ELEMENT_SET:
      buildVTableOfValue((value as PropertySetValue).owner, module);
      if ((value as PropertySetValue).value)
        buildVTableOfValue((value as PropertySetValue).value!, module);
      break;
    case SemanticsValueKind.BUILTIN_INDEX_SET:
    case SemanticsValueKind.BUILTIN_KEY_SET:
    case SemanticsValueKind.OBJECT_INDEX_SET:
    case SemanticsValueKind.OBJECT_KEY_SET:
    case SemanticsValueKind.INTERFACE_INDEX_SET:
    case SemanticsValueKind.INTERFACE_KEY_SET:
    case SemanticsValueKind.SUPER_INDEX_SET:
    case SemanticsValueKind.SUPER_KEY_SET:
      buildVTableOfValue((value as ElementSetValue).owner, module);
      buildVTableOfValue((value as ElementSetValue).index, module);
      if ((value as ElementSetValue).value)
        buildVTableOfValue((value as ElementSetValue).value!, module);
      break;
    default:
      return;
  }
}

function buildVTableOfStatement(stmt: SemanticsNode, module: ModuleNode) {
   //console.log(`=== buildVTableOfStatement ${SemanticsKind[stmt.kind]}`);
   switch(stmt.kind) {
     case SemanticsKind.BLOCK:
       buildVTableOfStatements((stmt as BlockNode).statements, module);
       break;
     case SemanticsKind.FUNCTION:
       buildVTableOfStatement((stmt as FunctionDeclareNode).body, module);
       break;
     case SemanticsKind.RETURN:
       if ((stmt as ReturnNode).expr)
         buildVTableOfValue((stmt as ReturnNode).expr!, module);
       break;
     case SemanticsKind.BASIC_BLOCK:
       buildVTableOfValues((stmt as BasicBlockNode).valueNodes, module);
       break;
     case SemanticsKind.IF:
       buildVTableOfValue((stmt as IfNode).condition, module);
       buildVTableOfStatement((stmt as IfNode).trueNode, module);
       if ((stmt as IfNode).falseNode)
         buildVTableOfStatement((stmt as IfNode).falseNode!, module);
       break;
     case SemanticsKind.FOR:
       if ((stmt as ForNode).initialize)
         buildVTableOfStatement((stmt as ForNode).initialize!, module);
       if ((stmt as ForNode).condition)
         buildVTableOfValue((stmt as ForNode).condition!, module);
       if ((stmt as ForNode).next)
         buildVTableOfValue((stmt as ForNode).next!, module);
       if ((stmt as ForNode).body)
         buildVTableOfStatement((stmt as ForNode).body!, module);
       break;
     case SemanticsKind.WHILE:
     case SemanticsKind.DOWHILE:
       buildVTableOfValue((stmt as WhileNode).condition, module);
       if ((stmt as WhileNode).body)
         buildVTableOfStatement((stmt as WhileNode).body!, module);
       break;
     case SemanticsKind.SWITCH:
       buildVTableOfValue((stmt as SwitchNode).condition, module);
       buildVTableOfStatements((stmt as SwitchNode).caseClause, module);
       if ((stmt as SwitchNode).defaultClause)
         buildVTableOfStatement((stmt as SwitchNode).defaultClause!, module);
       break;
     case SemanticsKind.CASE_CLAUSE:
       if ((stmt as CaseClauseNode).body)
          buildVTableOfStatement((stmt as CaseClauseNode).body!, module);
       break;
     case SemanticsKind.DEFAULT_CLAUSE:
       if ((stmt as DefaultClauseNode).body)
         buildVTableOfStatement((stmt as DefaultClauseNode).body!, module);
   }
}

export function processVTables(module: ModuleNode) {
  //console.log(`===== processVTables`);
  for (const f of module.functions) {
    buildVTableOfStatement(f, module);
  }
}

