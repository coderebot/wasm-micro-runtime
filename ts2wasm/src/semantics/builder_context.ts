/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';

import { Logger } from '../log.js';	

import {
    Scope,
    ScopeKind,
    NamespaceScope,
    GlobalScope,
    FunctionScope
} from '../scope.js';

import {
    Variable
} from '../variable.js';

import {
    Type,
    TypeKind,
    TSClass,
} from '../type.js';

import {
    SemanticsValue,
    VarValue
} from './value.js';

import {
    ValueType,
    CustomTypeId,
} from './value_types.js';

import {
    SemanticsNode,
    ModuleNode,
    FunctionDeclareNode,
    VarDeclareNode,
} from './semantics_nodes.js';

export type SymbolKey = Variable | Scope | Type;
export type SymbolValue = SemanticsValue | ValueType | SemanticsNode;

export interface BuildEnv {
  scope: Scope;
  symbols: Map<SymbolKey, SymbolValue>;
  function?: FunctionDeclareNode;
}

export enum ValueReferenceKind {
   LEFT,
   RIGHT,
}

export function SymbolKeyToString(key?: SymbolKey) : string {
  if (!key) return 'NULL';

  if (key! instanceof Variable) {
    const v = key! as Variable;
    const scope = SymbolKeyToString(v.scope ?? undefined);
    return `[VAR ${v.varName}(${v.mangledName}) ${SymbolKeyToString(v.varType)}  ${scope}]`;
  } else if (key! instanceof Type) {
    const t = key! as Type;
    if (key.kind == TypeKind.CLASS)
      return `[Class ${(t as TSClass).typeId}]`;
    return `[Type ${t.kind}]`;
  } else if (key! instanceof Scope) {
    const s = key! as Scope;
    return `[Scope: ${s.kind} ${s.getName()}]`;
  }
  return `Unknown type ${key}`;
}

export class BuildContext {
  globalSymbols: Map<SymbolKey, SymbolValue> = new Map();
  private typeIdx: number = CustomTypeId;

  stackEnv: BuildEnv[] = [];
  valueReferenceStack: ValueReferenceKind[] = [];

  constructor(public module: ModuleNode) { }

  nextTypeId() : number {
    const typeId = this.typeIdx;
    this.typeIdx += 2; // typeId for instance interface, typeId + 1 for class interface
    return typeId;
  }

  currentReference() : ValueReferenceKind {
    if (this.valueReferenceStack.length == 0)
      return ValueReferenceKind.RIGHT;

    return this.valueReferenceStack[this.valueReferenceStack.length - 1];
  }

  pushReference(type: ValueReferenceKind) {
    this.valueReferenceStack.push(type);
  }
  popReference() {
    this.valueReferenceStack.pop();
  }

  push(scope: Scope, symbols?: Map<SymbolKey, SymbolValue>) {
    this.stackEnv.push({
      scope: scope,
      symbols: symbols ? symbols : new Map() 
    });
  }

  pushFunction(scope: Scope, params: Map<SymbolKey, SymbolValue>) {
    this.stackEnv.push({scope: scope, symbols: params});
  }

  pop() {
    this.stackEnv.pop();
  }


  top() : BuildEnv {
    return this.stackEnv[this.stackEnv.length - 1];
  }

  currentFunction() : FunctionDeclareNode | undefined {
    for (let i = this.stackEnv.length - 1; i >= 0; i --) {
      if (this.stackEnv[i].function) return this.stackEnv[i].function;
    }
    return undefined;
  }

  getScopeNamespace() : string {
    let ns: string[] = [];
    for (let i = this.stackEnv.length - 1; i >= 0; i --) {
      const scope = this.stackEnv[i].scope;
      if (scope.kind == ScopeKind.GlobalScope) {
        ns.unshift((scope as GlobalScope).moduleName);
      } else if (scope.kind == ScopeKind.NamespaceScope) {
        ns.unshift((scope as NamespaceScope).name);
      }
    }
    return ns.join('|');
  }

  findSymbol(id: string) : SymbolValue | undefined {
    const name = this.top().scope.findIdentifier(id, true);
    console.log(`=== findSymbol name: ${id}: ${SymbolKeyToString(name)}`);
    if (!name) {
      Logger.error(`Unknown identifier name "${name}"`);
      return undefined;
    }
    return this.findSymbolKey(name!);
  }

  findSymbolKey(name: SymbolKey) : SymbolValue | undefined {
    for (let i = this.stackEnv.length - 1; i >= 0; i --) {
      const env = this.stackEnv[i];
      console.log(`=== findSymbolKey scope[${i}] ${SymbolKeyToString(env.scope)}, ${env.symbols}`);
      env.symbols.forEach((v, k) => console.log(`=== findSymbolKey symbols ${SymbolKeyToString(k)}, ${v.toString()}`));
      if (env.symbols.has(name))
	return env.symbols.get(name);      
    }
    this.globalSymbols.forEach((v, k) => console.log(`=== global symbols ${SymbolKeyToString(k)}, ${v.toString()}`));
    return this.globalSymbols.get(name);
  }

  findValueType(name: SymbolKey) : ValueType | undefined {
    const value = this.findSymbolKey(name);
    if (!value) return undefined;
    console.log(`===== findValueType ${SymbolKeyToString(name)}: ${value}`);
    if (value instanceof ValueType) return value as ValueType;
    if (value instanceof VarDeclareNode) return (value as VarDeclareNode).type;
    return undefined;
  }
}
