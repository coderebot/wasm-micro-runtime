/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';
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
    ParameterNodeFlag,
} from './semantics_nodes.js';

import { ParserContext } from '../frontend.js';
import {
    Type,
    TSClass,
    TsClassField,
    TsClassFunc,
    FunctionKind,
    TypeKind,
    TSFunction,
    TSArray,
} from '../type.js';
import { ObjectMetaInfo, MemberType, MemberInfo, ClassMetaInfo } from './runtime.js';
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

import {
    BuildEnv,
    BuildContext,
    SymbolKey,
    SymbolValue,
    SymbolKeyToString
} from './builder_context.js';

import {
    SemanticsValueKind,
    SemanticsValue,
    VarValue,
    ClassStaticValue,
} from './value.js';

import {
    Scope,
    ScopeKind,
    GlobalScope,
    FunctionScope,
    ClassScope,
    BlockScope,
} from '../scope.js';

import {
    createType
} from './expression_builder.js';

import { buildStatement, createLocalSymbols } from './statement_builder.js';

import { processVTables } from './vtable_builder.js';

function updateMetaMembers(objInfo : ObjectMetaInfo | undefined, context: BuildContext) {
   if (!objInfo) return;
   for (const m of objInfo!.members) {
     m.valueType = createType(context, m.valueType as unknown as Type);
   }
}

function processTypes(context: BuildContext, globalScopes: Array<GlobalScope>) {
    for (const scope of globalScopes) {
	scope.traverseScopTree((scope) => {
  	  context.push(scope);
	  scope.namedTypeMap.forEach((type, name) => {
	      console.log(`== type: ${name}, ${type.kind}`);
	      createType(context, type);
	    });
	  context.pop();
	});
    }

    // update the meta fields & methods
    for (const meta of context.module.metas.values()) {
      updateMetaMembers(meta.instance, context);
      updateMetaMembers(meta.clazz, context);
    }
}

function processGlobalVars(context: BuildContext, globalScopes: Array<GlobalScope>) {
    let index = 1;
    const module = context.module;
    for (const g of globalScopes) {
      for (const v of g.varArray) {
        if (v.isLocalVar())  continue;
	console.log(`=== processGlobalVars ${v.mangledName} ${v.varName} declare ${v.isDeclare()}`);
	const storage : VarStorageType = v.isConst() || v.isReadOnly()
	              ? SemanticsValueKind.GLOBAL_CONST : SemanticsValueKind.GLOBAL_VAR;
        let type = module.findValueTypeByType(v.varType);
	if (!type) type = Primitive.Any;

	const var_decl = new VarDeclareNode(storage, type, v.mangledName, index++, 0);

	module.globalVars.push(var_decl);
	context.globalSymbols.set(v, var_decl);
      }
    }
}

function buildStatements(context: BuildContext, scope: Scope) : SemanticsNode[] {

    const statements : SemanticsNode[] = [];
    let basic_block : BasicBlockNode | undefined = undefined;

    for (const statement of scope.statements) {
       const r = buildStatement(statement, context);
       if (r instanceof SemanticsValue) {
         if (!basic_block) {
	    basic_block = new BasicBlockNode();
            statements.push(basic_block);
	 }
	 basic_block!.pushSemanticsValue(r as SemanticsValue);
       } else {
	 basic_block = undefined;
         statements.push(r as SemanticsNode);
       }
    }

    return statements;
}

function processGlobalStatements(context: BuildContext, g: GlobalScope) {
    context.push(g);
    const statements = buildStatements(context, g);
    context.pop();
    const block = new BlockNode(statements);


    const globalStart = new FunctionDeclareNode(
	    g.startFuncName,
	    FunctionOwnKind.DEFAULT,
	    GetPredefinedType(PredefinedTypeId.FUNC_VOID_VOID) as FunctionType,
	    block);

    context.module.functions.push(globalStart);
}

function getFunctionOwnKind(f: FunctionScope) : FunctionOwnKind {
  const ft = f.funcType;
  if (ft.isDeclare) return FunctionOwnKind.DECLARE;
  if (ft.isMethod) return FunctionOwnKind.METHOD;
  if (ft.isStatic) return FunctionOwnKind.STATIC;
  return FunctionOwnKind.DEFAULT;
}

function createFunctionDeclareNode(context: BuildContext, f: FunctionScope) : FunctionDeclareNode {
    let name = f.funcName;
    if (f.className) {
       name = f.className + "_" + name;
    }
       
    const func_type = createType(context, f.funcType) as FunctionType;
    
    const parameters: VarDeclareNode[] = [];

    let pidx = 0;
    for (let i = 0; i < f.paramArray.length; i ++) {
       const p = f.paramArray[i];
       let p_type : ValueType | undefined = undefined;
       if (p.varName == '@this') {
          p_type = context.globalSymbols.get(f.parent!) as ValueType; // get the class type 
	  func_type.argumentsType.unshift(p_type); // add the this type;
	  pidx ++;
       } else {
	  if (p.varName != '@context') {
            p_type = func_type.argumentsType[pidx ++];
	  } else {
            continue;
	  }
       }
       console.log(`=== paramter[${i}] ${p.varName} ${p_type}`);
       const param = new VarDeclareNode(
                      SemanticsValueKind.PARAM_VAR,
           	      p_type ?? Primitive.Any,
		      p.varName,
           	      i,
           	      p.optional ? ParameterNodeFlag.OPTIONAL: 0);
      parameters.push(param);
    }
    
    const func = new FunctionDeclareNode(name,
                                      getFunctionOwnKind(f),
                                      func_type,
           			      new BlockNode([]),
           			      parameters);
    

    return func;
}

function processGlobalObjs(context: BuildContext, globalScope: GlobalScope) {
    for (const scope of globalScope.children) {
      if (scope.kind == ScopeKind.FunctionScope) {
	 const func = createFunctionDeclareNode(context, scope as FunctionScope);
         context.globalSymbols.set(scope, new VarValue(SemanticsValueKind.GLOBAL_CONST, func.funcType, func, func.name));
         context.module.functions.push(func);
      } else if (scope.kind == ScopeKind.ClassScope) {
	 const class_scope = scope as ClassScope;
         const type = createType(context, class_scope.classType);
	 const class_value = new ClassStaticValue(type as ClassType);
	 context.globalSymbols.set(class_scope, class_value);
	 context.globalSymbols.set(class_scope.classType, class_value);
      }
    }
}

function foreachScopeChildren(context: BuildContext, scope: Scope) {
    context.push(scope);
    for (const c of scope.children) {
      generateScopeNodes(context, c);
    }
    context.pop();
}

function generateFunctionScopeNodes(context: BuildContext, scope: FunctionScope) {
    let symbol = context.globalSymbols.get(scope);


    let func : FunctionDeclareNode | undefined = undefined;
    if (symbol && (symbol instanceof FunctionDeclareNode)) {
      func = symbol as FunctionDeclareNode;
    } else {
      func = createFunctionDeclareNode(context, scope);
      context.module.functions.push(func);
    }

    if (func.ownKind == FunctionOwnKind.DECLARE)
      return ;

    console.log(`=======>> begin build function ${func.name}====`);

    let has_params = false;
    //console.log(`==== FUNC ${func.name} params: ${func.parameters!.length}, ${scope.paramArray.length}`);
    if (func.parameters && func.parameters.length > 0) {
      has_params = true;
      // build parameter symbols
      const params = new Map<SymbolKey, SymbolValue>();
      let pidx = 0;
      for (let i = 0; i < scope.paramArray.length; i++) { // must use scope.paramArray
        const p = scope.paramArray[i];
	if (p.varName == '@context') { // context is ignored by func.parameters 
          continue;
	}
	const n = func.parameters[pidx++];
	console.log(`=== params :${p.varName} ${n.toString()}, ${n.type}`);
	params.set(p, new VarValue(n.storageType, n.type, n, n.index));
      }

      context.pushFunction(scope, params);
    }

    const [local_varlist, local_symbols] = createLocalSymbols(scope, context);
    func.varList = local_varlist;

    context.push(scope, local_symbols);
    context.top().function = func;
    if (local_symbols)
      local_symbols!.forEach((v, k) => console.log(`== local ${SymbolKeyToString(k)}, ${v.toString()}`));

    const statements = buildStatements(context, scope);

    func.body.statements = statements;

    context.pop();

    if (has_params)
      context.pop();

    console.log(`=======<< end build function ${func.name}====`);
}

function generateClassScopeNodes(context: BuildContext, scope: ClassScope) {
    foreachScopeChildren(context, scope);
}

function generateBlockScopeNodes(context: BuildContext, scope: BlockScope) {

}

function generateScopeNodes(context: BuildContext, scope: Scope) {
    switch(scope.kind) {
      case ScopeKind.FunctionScope:
         generateFunctionScopeNodes(context, scope as FunctionScope);
         break;
      case ScopeKind.ClassScope:
	 generateClassScopeNodes(context, scope as ClassScope);
         break;
      case ScopeKind.BlockScope:
         generateBlockScopeNodes(context, scope as BlockScope);
         break;
      default:
          foreachScopeChildren(context, scope);
          break;
    }
}


function processGlobals(context: BuildContext, parserContext: ParserContext) {
    processTypes(context, parserContext.globalScopes);

    processGlobalVars(context, parserContext.globalScopes);

    for (const g of parserContext.globalScopes) {
      processGlobalObjs(context, g);
    }

    for (const g of parserContext.globalScopes) {
      generateScopeNodes(context, g);
      processGlobalStatements(context, g);
    }
}

export function BuildModuleNode(parserContext: ParserContext): ModuleNode {
    const module = new ModuleNode();
    const context = new BuildContext(module);

    // create meta table
    processGlobals(context, parserContext);

    // process the vtables
    processVTables(module);

    return module;
}
