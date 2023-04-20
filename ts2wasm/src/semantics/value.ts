/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';

import { DumpWriter, CreateDefaultDumpWriter } from './dump.js';
import {
    ValueTypeKind,
    ValueType,
    PrimitiveType,
    Primitive,
    PrimitiveValueType,
    ClassType,
    FunctionType,
} from './value_types.js';
import { SymbolKeyToString } from './builder_context.js';
import { FunctionDeclareNode, VarDeclareNode } from './semantics_nodes.js';
import { VTable } from './runtime.js';

export enum SemanticsValueKind {
    NOP,
    UNIMPLEMENT,
    // terminal symbol
    THIS,
    SUPER,
    LITERAL,
    CLASS_STATIC,
    LOCAL_VAR,
    LOCAL_CONST,
    PARAM_VAR,
    GLOBAL_VAR,
    GLOBAL_CONST,
    CLOSURE_VAR,
    CLOSURE_CONST,
    TEMPL_VAR,

    //MEMBER_INDEX,
    //MEMBER_KEY,

    // expression
    BINARY_EXPR,
    POST_UNARY_EXPR,
    PRE_UNARY_EXPR,
    CONDITION_EXPR,

    FUNCTION_CALL,
    CLOSURE_CALL,

    CLASS_STATIC_GET_FIELD,
    CLASS_STATIC_SET_FIELD,
    CLASS_STATIC_CALL,

    OBJECT_GETTER,
    OBJECT_SETTER,
    OBJECT_GET_FIELD,
    OBJECT_SET_FIELD,
    OBJECT_METHOD_CALL,
    OBJECT_INDEX_GET,
    OBJECT_INDEX_SET,
    OBJECT_KEY_GET,
    OBJECT_KEY_SET,
    OBJECT_INDEX_CALL,
    OBJECT_KEY_CALL,

    INTERFACE_GETTER,
    INTERFACE_SETTER,
    INTERFACE_GET_FIELD,
    INTERFACE_SET_FIELD,
    INTERFACE_INDEX_GET,
    INTERFACE_INDEX_SET,
    INTERFACE_KEY_GET,
    INTERFACE_KEY_SET,
    INTERFACE_METHOD_CALL,
    INTERFACE_CONSTRCTOR_CALL,
    INTERFACE_INDEX_CALL,
    INTERFACE_KEY_CALL,

    NEW_CLASS,
    NEW_CLOSURE_FUNCTION,

    SUPER_CALL,
    SUPER_GETTER,
    SUPER_SETTER,
    SUPER_GET_FIELD,
    SUPER_SET_FIELD,
    SUPER_METHOD_CALL,
    SUPER_INDEX_GET,
    SUPER_INDEX_SET,
    SUPER_KEY_GET,
    SUPER_KEY_SET,
    SUPER_INDEX_CALL,
    SUPER_KEY_CALL,

    BUILTIN_GET_FIELD,
    BUILTIN_SET_FIELD,
    BUILTIN_GETTER,
    BUILTIN_SETTER,
    BUILTIN_INDEX_GET,
    BUILTIN_INDEX_SET,
    BUILTIN_KEY_GET,
    BUILTIN_KEY_SET,
    BUILTIN_METHOD_CALL,
    BUILTIN_INDEX_CALL,
    BUILTIN_KEY_CALL,

    OBJECT_CAST_INTERFACE,
    OBJECT_CAST_OBJECT,
    INTERFACE_CAST_INTERFACE,
    INTERFACE_CAST_OBJECT,
    CLASS_CAST_INTERFACE,
    VALUE_CAST_ANY,
    OBJECT_CAST_ANY,
    INTERFACE_CAST_ANY,
    VALUE_CAST_VALUE,
    ANY_CAST_VALUE,
    ANY_CAST_OBJECT,
    ANY_CAST_INTERFACE,

    VALUE_TO_STRING,
    OBJECT_TO_STRING,

    OBJECT_INSTANCE_OF,
    INTERFACE_INSTANCE_OF,

    ANY_GET_FIELD,
    ANY_SET_FIELD,
    ANY_GET_CALL,
    ANY_INDEX_GET,
    ANY_INDEX_SET,
    ANY_KEY_GET,
    ANY_KEY_SET,
    ANY_INDEX_CALL,
    ANY_KEY_CALL,

    GROUP_VALUE,
}

export type ValueBinaryOperator = ts.BinaryOperator;

export class SemanticsValue {
    constructor(public kind: SemanticsValueKind, public type: ValueType) {}

    toString() : string {
      return `[${SemanticsValueKind[this.kind]} ${this.type}]`;
    }

    dump(writer: DumpWriter) {
      writer.write(this.toString());
    }
}

export class ThisValue extends SemanticsValue {
  constructor(type: ClassType) {
    super(SemanticsValueKind.THIS, type);
  }
}

export class SuperValue extends SemanticsValue {
  constructor(type: ClassType) {
    super(SemanticsValueKind.SUPER, type);
  }
}

export class NopValue extends SemanticsValue {
   constructor() {
      super(SemanticsValueKind.NOP, Primitive.Void);
   }
}

export class LiteralValue extends SemanticsValue {
    constructor(type: PrimitiveType, public value: PrimitiveValueType) {
        super(SemanticsValueKind.LITERAL, type);
    }

    toString() : string {
      return `[Literal ${this.type}  ${this.value}]`;
    }
}

export type LocalVarValueKind =
    | SemanticsValueKind.LOCAL_VAR
    | SemanticsValueKind.LOCAL_CONST;
export type GlobalVarValueKind =
    | SemanticsValueKind.GLOBAL_VAR
    | SemanticsValueKind.GLOBAL_CONST;
export type ClosureVarValueKind =
    | SemanticsValueKind.CLOSURE_VAR
    | SemanticsValueKind.CLOSURE_CONST;
export type VarValueKind =
    | LocalVarValueKind
    | GlobalVarValueKind
    | ClosureVarValueKind
    | SemanticsValueKind.PARAM_VAR
    | SemanticsValueKind.TEMPL_VAR;

function VarRefToString(ref: any) : string {
  if (ref instanceof ValueType) {
    return (ref as ValueType).toString();
  } else if (ref instanceof FunctionDeclareNode) {
    return (ref as FunctionDeclareNode).toString();
  } else if (ref instanceof VarDeclareNode) {
    return (ref as VarDeclareNode).toString();
  }
  return `${ref}`;
}

export class VarValue extends SemanticsValue {
    constructor(
        kind: VarValueKind,
        type: ValueType,
	public ref: any,
        public index: number | string,
    ) {
        super(kind, type);
    }

    toString() : string {
      return `[VarValue(${SemanticsValueKind[this.kind]}): ${this.type} ${this.index}  "${VarRefToString(this.ref)}"]`;
    }
}

export class ClassStaticValue extends SemanticsValue {
    constructor(clazz: ClassType) {
      super(SemanticsValueKind.CLASS_STATIC, clazz);
    }

    get classType() : ClassType {
      return this.type as ClassType;
    }
}

export class BinaryExprValue extends SemanticsValue {
    constructor(
        type: ValueType,
        public opKind: ValueBinaryOperator,
        public left: SemanticsValue,
        public right: SemanticsValue,
    ) {
        super(SemanticsValueKind.BINARY_EXPR, type);
    }

    dump(writer: DumpWriter) {
      writer.write(`[BinaryExpr "${operatorString(this.opKind)}"]`);
      writer.shift();
      this.left.dump(writer);
      this.right.dump(writer);
      writer.unshift();
    }
}

export class PrefixUnaryExprValue extends SemanticsValue {
    constructor(
        type: PrimitiveType,
        public opKind: ts.PrefixUnaryOperator,
        public target: SemanticsValue,
    ) {
        super(SemanticsValueKind.PRE_UNARY_EXPR, type);
    }
}

export class PostUnaryExprValue extends SemanticsValue {
    constructor(
        type: PrimitiveType,
        public opKind: ts.PostfixUnaryOperator,
        public target: SemanticsValue,
    ) {
        super(SemanticsValueKind.POST_UNARY_EXPR, type);
    }
}

export class ConditionExprValue extends SemanticsValue {
    constructor(
        type: ValueType,
        public condition: SemanticsValue,
        public trueExpr: SemanticsValue,
        public falseExpr: SemanticsValue,
    ) {
        super(SemanticsValueKind.CONDITION_EXPR, type);
    }

    dump(writer: DumpWriter) {
      writer.write(`[Condition]`)
      writer.shift();
      this.condition.dump(writer);
      this.trueExpr.dump(writer);
      this.falseExpr.dump(writer);
      writer.unshift();
    }
}

export class FunctionCallBaseValue extends SemanticsValue {
    constructor(
        kind: SemanticsValueKind,
        type: ValueType,
	public funcType: FunctionType,
        public parameters?: SemanticsValue[],
    ) {
        super(kind, type);
    }
}

type FunctionCallValueKind =
    | SemanticsValueKind.FUNCTION_CALL
    | SemanticsValueKind.SUPER_CALL;
export class FunctionCallValue extends FunctionCallBaseValue {
    constructor(
        kind: FunctionCallValueKind,
        type: ValueType,
        public func: SemanticsValue,
	funcType?: FunctionType,
        parameters?: SemanticsValue[],
    ) {
        super(kind, type, funcType ? funcType : func.type as FunctionType, parameters);
    }
}

export class NewClosureFunction extends SemanticsValue {
  constructor(public funcNode: FunctionDeclareNode/*TODO context*/) {
    super(SemanticsValueKind.NEW_CLOSURE_FUNCTION, funcNode.funcType); 
  }
}

export class ClosureCallValue extends FunctionCallBaseValue {
    constructor(
        type: ValueType,
        public func: SemanticsValue,
        paramters: SemanticsValue[],
    ) {
        super(SemanticsValueKind.CLOSURE_CALL, type, func.type as FunctionType, paramters);
    }
}

export class ConstructorCallValue extends FunctionCallBaseValue {
    constructor(
	public self: SemanticsValue, 
        public classType: ClassType,
	funcType: FunctionType,
        paramters?: SemanticsValue[],
    ) {
        super(SemanticsValueKind.INTERFACE_CONSTRCTOR_CALL, Primitive.Void, funcType, paramters);
    }
}

export type PropertyCallValueKind =
      SemanticsValueKind.OBJECT_METHOD_CALL
    | SemanticsValueKind.INTERFACE_METHOD_CALL
    | SemanticsValueKind.CLASS_STATIC_CALL
    | SemanticsValueKind.SUPER_METHOD_CALL
    | SemanticsValueKind.BUILTIN_METHOD_CALL;

export class PropertyCallValue extends FunctionCallBaseValue {
    constructor(
        kind: PropertyCallValueKind,
        type: ValueType,
	funcType: FunctionType,
        public owner: SemanticsValue,
        public index: number | string,
        parameters?: SemanticsValue[],
    ) {
        super(kind, type, funcType, parameters);
    }

    dump(writer: DumpWriter) {
      writer.write(`[PropertyCall ${this.type}] @${this.index}`)
      writer.shift();
      this.owner.dump(writer);
      if (this.parameters) {
        for (const p of this.parameters) {
          p.dump(writer);
	}
      }
      writer.unshift();
    }
}

export type ElementCallValueKind =
      SemanticsValueKind.BUILTIN_INDEX_CALL
    | SemanticsValueKind.BUILTIN_KEY_CALL
    | SemanticsValueKind.OBJECT_INDEX_CALL
    | SemanticsValueKind.OBJECT_KEY_CALL
    | SemanticsValueKind.INTERFACE_INDEX_CALL
    | SemanticsValueKind.INTERFACE_KEY_CALL
    | SemanticsValueKind.SUPER_INDEX_CALL
    | SemanticsValueKind.SUPER_KEY_CALL;

export class ElementCallValue extends FunctionCallBaseValue {
    constructor(
        kind: ElementCallValueKind,
        type: ValueType,
	funcType: FunctionType,
        public owner: SemanticsValue,
        public index: SemanticsValue,
        parameters?: SemanticsValue[],
    ) {
        super(kind, type, funcType, parameters);
    }

    dump(writer: DumpWriter) {
      writer.write(`[ElementCall ${this.type}]`)
      writer.shift();
      this.owner.dump(writer);
      this.index.dump(writer);
      if (this.parameters) {
        for (const p of this.parameters) {
          p.dump(writer);
	}
      }
      writer.unshift();
    }
}


export type PropertyGetValueKind =
      SemanticsValueKind.OBJECT_GETTER
    | SemanticsValueKind.INTERFACE_GETTER
    | SemanticsValueKind.SUPER_GETTER
    | SemanticsValueKind.OBJECT_GET_FIELD
    | SemanticsValueKind.INTERFACE_GET_FIELD
    | SemanticsValueKind.SUPER_GET_FIELD
    | SemanticsValueKind.ANY_GET_FIELD
    ;

export class PropertyGetValue extends SemanticsValue {
    constructor(
        kind: PropertyGetValueKind,
        type: ValueType,
        public owner: SemanticsValue,
        public index: number | string,
    ) {
        super(kind, type);
    }

    dump(writer: DumpWriter) {
      writer.write(`[PropertyGet(${SemanticsValueKind[this.kind]}) ${this.type} @${this.index}]`);
      writer.shift();
      this.owner.dump(writer);
      writer.unshift();
    }
}

export type ElementGetValueKind =
 	 SemanticsValueKind.BUILTIN_INDEX_GET
       | SemanticsValueKind.BUILTIN_KEY_GET
       | SemanticsValueKind.OBJECT_INDEX_GET
       | SemanticsValueKind.OBJECT_KEY_GET
       | SemanticsValueKind.INTERFACE_INDEX_GET
       | SemanticsValueKind.INTERFACE_KEY_GET
       | SemanticsValueKind.SUPER_INDEX_GET
       | SemanticsValueKind.SUPER_KEY_GET;

export class ElementGetValue extends SemanticsValue {
    constructor(
        kind: ElementGetValueKind,
        type: ValueType,
        public owner: SemanticsValue,
        public index: SemanticsValue,
    ) {
        super(kind, type);
    }

    dump(writer: DumpWriter) {
      writer.write(`[ElementSet(${SemanticsValueKind[this.kind]}) ${this.type}]`);
      writer.shift();
      this.owner.dump(writer);
      this.index.dump(writer);
      writer.unshift();
    }
}


export type PropertySetValueKind =
     SemanticsValueKind.OBJECT_SETTER
    | SemanticsValueKind.INTERFACE_SETTER
    | SemanticsValueKind.SUPER_SETTER
    | SemanticsValueKind.OBJECT_SET_FIELD
    | SemanticsValueKind.INTERFACE_SET_FIELD
    | SemanticsValueKind.SUPER_SET_FIELD
    | SemanticsValueKind.ANY_SET_FIELD
    ;


export class PropertySetValue extends SemanticsValue {
    constructor(
        kind: PropertySetValueKind,
        type: ValueType,
        public owner: SemanticsValue,
        public index: number | string,
        public value?: SemanticsValue,
	public opKind?: ValueBinaryOperator  
    ) {
        super(kind, type);
    }

    dump(writer: DumpWriter) {
      writer.write(`[PropertySet(${SemanticsValueKind[this.kind]}) ${this.type}  ${this.index} ${this.opKind? operatorString(this.opKind) : "Unkonwn"}]`);
      writer.shift();
      this.owner.dump(writer);
      if (this.value)
        this.value.dump(writer);
      writer.unshift();
    }
}

export type ElementSetValueKind = 
 	 SemanticsValueKind.BUILTIN_INDEX_SET
       | SemanticsValueKind.BUILTIN_KEY_SET
       | SemanticsValueKind.OBJECT_INDEX_SET
       | SemanticsValueKind.OBJECT_KEY_SET
       | SemanticsValueKind.INTERFACE_INDEX_SET
       | SemanticsValueKind.INTERFACE_KEY_SET
       | SemanticsValueKind.SUPER_INDEX_SET
       | SemanticsValueKind.SUPER_KEY_SET;

export class ElementSetValue extends SemanticsValue {
    constructor(
        kind: ElementSetValueKind,
        type: ValueType,
        public owner: SemanticsValue,
        public index: SemanticsValue,
        public value?: SemanticsValue,
	public opKind?: ValueBinaryOperator  
    ) {
        super(kind, type);
    }

    dump(writer: DumpWriter) {
      writer.write(`[ElementSet(SemanticsValueKind[this.kind]) ${this.type}  ${this.opKind? operatorString(this.opKind) : "Unkonwn"}]`);
      writer.shift();
      this.owner.dump(writer);
      this.index.dump(writer);
      if (this.value)
        this.value.dump(writer);
      writer.unshift();
    }
}


type CastValueKind =
    | SemanticsValueKind.VALUE_CAST_VALUE
    | SemanticsValueKind.VALUE_CAST_ANY
    | SemanticsValueKind.OBJECT_CAST_INTERFACE
    | SemanticsValueKind.OBJECT_CAST_OBJECT
    | SemanticsValueKind.OBJECT_CAST_ANY
    | SemanticsValueKind.INTERFACE_CAST_INTERFACE
    | SemanticsValueKind.INTERFACE_CAST_OBJECT
    | SemanticsValueKind.INTERFACE_CAST_ANY
    | SemanticsValueKind.CLASS_CAST_INTERFACE
    | SemanticsValueKind.ANY_CAST_INTERFACE
    | SemanticsValueKind.ANY_CAST_OBJECT
    | SemanticsValueKind.ANY_CAST_VALUE;
export class CastValue extends SemanticsValue {
    constructor(kind: CastValueKind, type: ValueType, public value: SemanticsValue) {
        super(kind, type);
    }

    public vtable?: VTable;

    dump(writer: DumpWriter) {
      let vt_str = 'DYNAMIC_CAST';
      if (this.vtable) {
        vt_str = `STATIC_CAST from "${this.vtable.meta.name}"`; 
      }
      writer.write(`[CastValue(${SemanticsValueKind[this.kind]}) From "${this.value.type}" To "${this.type}" ${vt_str}]`);
      writer.shift();
      this.value.dump(writer);
      writer.unshift();

    }
}

type InstanceOfValueKind =
    | SemanticsValueKind.OBJECT_INSTANCE_OF
    | SemanticsValueKind.INTERFACE_INSTANCE_OF;
export class InstanceOfValue extends SemanticsValue {
    constructor(kind: InstanceOfValueKind, public value: SemanticsValue, public classType: ClassType) {
        super(kind, Primitive.Boolean);
    }
}

// the last value of values is the GroupValue's final value
export class GroupValue extends SemanticsValue {
  constructor(type: ValueType, public values: SemanticsValue[]) {
    super(SemanticsValueKind.GROUP_VALUE, type);
  }

  dump(writer: DumpWriter) {
    writer.write(`[GroupValue ${this.type}]`);
    writer.shift();
    for (const v of this.values) {
      v.dump(writer);
    }
    writer.unshift();
  }
}

export class NewClassValue extends SemanticsValue {
  constructor(type: ValueType) {
    super(SemanticsValueKind.NEW_CLASS, type);
  }

  public vtable?: VTable;
}

export type ToStringValueKind = SemanticsValueKind.VALUE_TO_STRING | SemanticsValueKind.OBJECT_TO_STRING;

export class ToStringValue extends SemanticsValue {
  constructor(kind: ToStringValueKind, public value: SemanticsValue) {
    super(kind, Primitive.String);
  }
}

export class UnimplementValue extends SemanticsValue {
  constructor(public tsNode: ts.Node) {
    super(SemanticsValueKind.UNIMPLEMENT, Primitive.Void);
  }

  toString() : string {
    const sourceFile = this.tsNode.getSourceFile();
    const start = this.tsNode.getStart(sourceFile);
    const startLineInfo = sourceFile.getLineAndCharacterOfPosition(start);
    const source_info = `@"${sourceFile.fileName}":${startLineInfo.line + 1}:${startLineInfo.character}  source: ${this.tsNode.getFullText(sourceFile)}`;
    return `[Unimplement ExpressionKind: ${ts.SyntaxKind[this.tsNode.kind]} ${source_info}]`;
  }

}

//////////////////////////////////
export function operatorString(kind: ts.BinaryOperator) : string {
  switch(kind) {
    case ts.SyntaxKind.EqualsToken:
      return '=';
    case ts.SyntaxKind.PlusEqualsToken:
      return '+=';
    case ts.SyntaxKind.MinusEqualsToken:
      return '-=';
    case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
      return '**=';
    case ts.SyntaxKind.AsteriskEqualsToken:
      return '*=';
    case ts.SyntaxKind.SlashEqualsToken:
      return '/=';
    case ts.SyntaxKind.PercentEqualsToken:
      return '%=';
    case ts.SyntaxKind.AmpersandEqualsToken:
      return '&=';
    case ts.SyntaxKind.BarEqualsToken:
      return '|=';
    case ts.SyntaxKind.CaretEqualsToken:
      return '^=';
    case ts.SyntaxKind.LessThanLessThanEqualsToken:
      return '<<=';
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken:
      return '>>>=';
    case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken:
      return '>>=';
    case ts.SyntaxKind.AsteriskAsteriskToken:
      return '**';
    case ts.SyntaxKind.AsteriskToken:
      return '*';
    case ts.SyntaxKind.SlashToken:
      return '/';
    case ts.SyntaxKind.PercentToken:
      return '%';
    case ts.SyntaxKind.PlusToken:
      return '+';
    case ts.SyntaxKind.MinusToken:
      return '-';
    case ts.SyntaxKind.CommaToken:
      return ',';
    case ts.SyntaxKind.LessThanLessThanToken:
      return '<<';
    case ts.SyntaxKind.GreaterThanGreaterThanToken:
      return '>>';
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
      return '<<<';
    case ts.SyntaxKind.LessThanToken:
      return '<';
    case ts.SyntaxKind.LessThanEqualsToken:
      return '<=';
    case ts.SyntaxKind.GreaterThanToken:
      return '>';
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return '>=';
    case ts.SyntaxKind.InstanceOfKeyword:
      return 'instance of';
    case ts.SyntaxKind.InKeyword:
      return 'in';
    case ts.SyntaxKind.EqualsEqualsToken:
      return '==';
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return '===';
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return '!==';
    case ts.SyntaxKind.ExclamationEqualsToken:
      return '!=';
    case ts.SyntaxKind.AmpersandToken:
      return '&';
    case ts.SyntaxKind.BarToken:
      return '|';
    case ts.SyntaxKind.CaretToken:
      return '^';
    case ts.SyntaxKind.AmpersandAmpersandToken:
      return '&&';
    case ts.SyntaxKind.BarBarToken:
      return '||';
    case ts.SyntaxKind.QuestionQuestionToken:
      return '??';
  }
  return ts.SyntaxKind[kind];
}

