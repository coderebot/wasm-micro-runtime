/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import { DumpWriter, CreateDefaultDumpWriter } from './dump.js';
import { ObjectMetaInfo, MemberType, VTableMember, VTable, ClassMetaInfo } from './runtime.js';

import {
    SemanticsValue,
    VarValue,
    LiteralValue,
    SemanticsValueKind,
} from './value.js';

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
    PredefinedArrayType,
    PredefinedSetType,
    PredefinedMapType,
    PredefinedFunctionType,
    GetPredefinedType,
    GetPredefinedArrayType,
    GetPredefinedSetType,
    GetPredefinedMapType,
 } from './predefined_types.js';

export enum SemanticsKind {
    EMPTY,
    BASIC_BLOCK,
    MODULE,
    FUNCTION,
    VAR_DECLARE,
    BLOCK,
    IF,
    RETURN,
    FOR,
    FOR_IN,
    FOR_OF,
    WHILE,
    DOWHILE,
    SWITCH,
    CASE_CLAUSE,
    DEFAULT_CLAUSE,
    BREAK,
    CONTINUE,
}

export class SemanticsNode {
    constructor(public kind: SemanticsKind) {}

    dump(writer: DumpWriter) {
        writer.write(SemanticsKind[this.kind]);
    }
}

export class EmptyNode extends SemanticsNode {
    constructor() {
        super(SemanticsKind.EMPTY);
    }
}

export class ReturnNode extends SemanticsNode {
    constructor(public expr: SemanticsValue | undefined) {
        super(SemanticsKind.RETURN);
    }

    dump(writer: DumpWriter) {
      writer.write("[RETURN]");
      writer.shift();
      if (this.expr)
        this.expr.dump(writer);
      writer.unshift();
    }
}

export type VarStorageType = SemanticsValueKind.LOCAL_VAR | SemanticsValueKind.LOCAL_CONST
                           | SemanticsValueKind.GLOBAL_VAR | SemanticsValueKind.GLOBAL_CONST
			   | SemanticsValueKind.PARAM_VAR
			   | SemanticsValueKind.CLOSURE_VAR | SemanticsValueKind.CLOSURE_CONST;

export enum ParameterNodeFlag {
  OPTIONAL,
}

export class VarDeclareNode extends SemanticsNode {
    constructor(public storageType: VarStorageType, public type: ValueType, public name: string, public index: number, public flags: number) {
        super(SemanticsKind.VAR_DECLARE);
    }


    toString() : string {
      return `Var ${this.name} ${SemanticsValueKind[this.storageType]} ${this.type} ${this.index} ${this.flags}`;

    }
    dump(writer: DumpWriter) {
      writer.write(this.toString());
    }
}

export enum FunctionOwnKind {
  STATIC,
  METHOD,
  GETTER,
  SETTER,
  DEFAULT,
  DECLARE,
};

export class FunctionDeclareNode extends SemanticsNode {
    constructor(public name: string,
		public ownKind: FunctionOwnKind,
		public funcType: FunctionType,
		public body: BlockNode,
		public parameters?: VarDeclareNode[],
	        public varList?: VarDeclareNode[]) {
        super(SemanticsKind.FUNCTION);
    }

    toString() : string {
      return `FUNCTION: ${this.name} ${FunctionOwnKind[this.ownKind]} ${this.funcType}`;
    }

    dump(writer: DumpWriter) {
      writer.write(this.toString());
    }

    dumpCode(writer: DumpWriter) {
      this.dump(writer);
      writer.shift();
      this.body.dump(writer);
      writer.unshift();
    }
}

export class BlockNode extends SemanticsNode {
   constructor(public statements: SemanticsNode[], public varList?: VarDeclareNode[]) {
        super(SemanticsKind.BLOCK);
   }

   dump(writer: DumpWriter) {
     if (this.varList) {
       for (const v of this.varList)
         v.dump(writer);
       writer.write(""); // empty line
     }

     for (const s of this.statements)
       s.dump(writer);
   }
}

export class BasicBlockNode extends SemanticsNode {
    constructor() {
        super(SemanticsKind.BASIC_BLOCK);
    }

    public valueNodes: SemanticsValue[] = [];

    pushSemanticsValue(valueNode: SemanticsValue) {
       this.valueNodes.push(valueNode);
    }

    dump(writer: DumpWriter) {
      super.dump(writer);
      writer.shift();
      for (const v of this.valueNodes)
        v.dump(writer);
      writer.unshift();
    }
}

export class IfNode extends SemanticsNode {
    constructor(public condition: SemanticsValue,
		public trueNode: SemanticsNode,
		public falseNode?: SemanticsNode)
    {
         super(SemanticsKind.IF);
    }

    dump(writer: DumpWriter) {
      writer.write("[IF]");
      writer.shift();
      this.condition.dump(writer);
      this.trueNode.dump(writer);
      writer.unshift();
      if (this.falseNode) {
        writer.write("[ELSE]");
	writer.shift();
	this.falseNode.dump(writer);
	writer.unshift();
      }
    }
}

export class ForNode extends SemanticsNode {
    constructor(public varList?: VarDeclareNode[],
	        public initialize?: SemanticsNode,
                public condition?: SemanticsValue,
		public next?: SemanticsValue,
		public body?: SemanticsNode) {
          super(SemanticsKind.FOR);
    }

    dump(writer: DumpWriter) {
      writer.write("[FOR]");
      writer.shift();
      if (this.varList)
        for (const v of this.varList) {
          v.dump(writer);
	}
	if (this.initialize)
          this.initialize.dump(writer);
        if (this.condition)
          this.condition.dump(writer);
        if (this.next)
          this.next.dump(writer);
        if (this.body)
          this.body.dump(writer);
      writer.unshift();
    }
}

export class ForInNode extends SemanticsNode {
    constructor(public key: VarDeclareNode,
		public target: VarValue,
		public body?: SemanticsNode)
    {
        super(SemanticsKind.FOR_IN);
    }
}

export class ForOfNode extends SemanticsNode {
    constructor(public value: VarDeclareNode,
		public target: VarValue,
		public body?: SemanticsNode)
    {
        super(SemanticsKind.FOR_OF);
    }
}

export class WhileNode extends SemanticsNode {
    constructor(kind: SemanticsKind.WHILE | SemanticsKind.DOWHILE,
		public condition: SemanticsValue,
		public body?: SemanticsNode)
    {
        super(kind);
    }

    isDoWhile() : boolean {
      return this.kind == SemanticsKind.DOWHILE;
    }

    dump(writer: DumpWriter) {
      if (this.isDoWhile())
        writer.write("[DO-WHILE]");
      else
        writer.write("[WHILE]");
      writer.shift();
      this.condition.dump(writer);
      if (this.body)
        this.body.dump(writer);
      writer.unshift();
    }
}

export class SwitchNode extends SemanticsNode {
    constructor(public condition: SemanticsValue,
		public caseClause: CaseClauseNode[],
	        public defaultClause?: DefaultClauseNode)	
    {
      super(SemanticsKind.SWITCH);
    }

    dump(writer: DumpWriter) {
      writer.write("[SWITCH]");
      writer.shift();
      for (const c of this.caseClause)
        c.dump(writer);
      if (this.defaultClause)
        this.defaultClause.dump(writer);
      writer.unshift();
    }
}

export class CaseClauseNode extends SemanticsNode {
    constructor(public caseVar: SemanticsValue,
	        public body?: SemanticsNode)
    {
         super(SemanticsKind.CASE_CLAUSE);
    }

    dump(writer: DumpWriter) {
      writer.write("[CASE]");
      this.caseVar.dump(writer);
      if (this.body) this.body.dump(writer);
    }
}

export class DefaultClauseNode extends SemanticsNode {
    constructor(public body?: SemanticsNode)
    {
        super(SemanticsKind.DEFAULT_CLAUSE);
    }
    dump(writer: DumpWriter) {
      writer.write("[DEFAULT]");
      if (this.body) this.body.dump(writer);
    }
}

export class BreakNode extends SemanticsNode {
    constructor() {
       super(SemanticsKind.BREAK);
    }
}

export class ContinueNode extends SemanticsNode {
    constructor() {
       super(SemanticsKind.CONTINUE);
    }
}


export class ModuleNode extends SemanticsNode {
    public metas: Map<Type, ClassMetaInfo> = new Map();
    public vtables: Map<number, VTable[]> = new Map();
    public types: Map<Type, ValueType> = new Map();
    public typeByIds: Map<number, ValueType> = new Map();
    public globalVars: VarDeclareNode[] = [];
    public functions: FunctionDeclareNode[] = [];

    constructor() {
        super(SemanticsKind.MODULE);
    }

    dumpMeta(m: ObjectMetaInfo, prefix: string, writer: DumpWriter) {
      writer.write(`${prefix} name: ${m.name}`);
      writer.shift();
      for (const mb of m.members) {
        const value_type = (mb.valueType as ValueType).toString();
        writer.write(`${mb.name} ${MemberType[mb.type]} ${mb.index} ${value_type}`);
      }
      writer.unshift();
    }

    dumpMetas(writer: DumpWriter) {
      writer.write("metas: [");
      writer.shift();
      this.metas.forEach((obj_meta, key)  => {
         writer.write(`{ TypeId: ${key}`);
         writer.shift();
	 this.dumpMeta(obj_meta.instance, "instance", writer);
	 if (obj_meta.clazz)
	    this.dumpMeta(obj_meta.clazz, "class", writer);

	 writer.unshift();
         writer.write('}');
      });
    }

    dumpGlobalVars(writer: DumpWriter) {
      for(const v of this.globalVars)
        v.dump(writer);
    }

    dumpFunctions(writer: DumpWriter) {
      for (const f of this.functions)
        f.dump(writer);
    }

    dumpVTables(writer: DumpWriter) {
      this.vtables.forEach((vts, id) => {
	const to_type = this.typeByIds.get(id);
	if (!to_type) {
          console.log(`unknown typeId ${id}`);
	  return;
	}
	const to_class = to_type as ClassType;
	const to_meta = to_class.class_meta;
	const to_inst = to_meta.instance;
        writer.write(`VTABLES ${to_meta.namespace}|${to_inst.name} {`);
        writer.shift();
	for (const vt of vts) {
          writer.write(`VTABLE FROM ${vt.meta.name} [`);
	  writer.shift();
	  for (let i = 0; i < vt.members.length; i ++) {
            const m = vt.members[i];
	    const inst_m = to_inst.members[i];
	    //const meta_m = vt.meta.members[i];
            writer.write(`[@${i}] ${m}: ${inst_m.name} ${MemberType[inst_m.type]} ${inst_m.index} ${inst_m.valueType as ValueType}`);
	  }
	  writer.unshift();
	  writer.write(']');
	}
	writer.unshift();
	writer.write('}');
      });
    }

    dumpTypes(writer: DumpWriter) {
      writer.write("types: {");
      writer.shift();

      this.types.forEach((v, k) => {
        writer.write(v.toString());
      });

      writer.unshift();
      writer.write("}");
    }

    dump(writer: DumpWriter) {
      writer.write("ModuleNode [");
      writer.shift();

      this.dumpMetas(writer);
      this.dumpTypes(writer);
      this.dumpGlobalVars(writer);
      this.dumpVTables(writer);
      this.dumpFunctions(writer);

      writer.unshift();
      writer.write("]");

      writer.unshift();
      writer.write("]");
    }

    dumpCodeTrees(writer: DumpWriter) {
      for (const f of this.functions) {
	f.dumpCode(writer);
	writer.write("")
      }
    }

    findValueTypeByType(type: Type) : ValueType | undefined {
       if (type == undefined || type == null)
         return Primitive.Any;

       switch(type.kind) {
         case TypeKind.VOID:    return Primitive.Void;
	 case TypeKind.BOOLEAN: return Primitive.Boolean;
	 case TypeKind.ANY:     return Primitive.Any;
	 case TypeKind.NUMBER:  return Primitive.Number;
	 case TypeKind.STRING:  return Primitive.String;
	 case TypeKind.NULL:    return Primitive.Null;
	 case TypeKind.UNDEFINED: return Primitive.Undefined;
       }

       let valueType = this.types.get(type);
       if (valueType) return valueType;

       switch(type.kind) {
	 case TypeKind.ARRAY:
         {
	   const elementType = this.findValueTypeByType((type as TSArray).elementType);
	   //console.log(`===== element: ${(type as TSArray).elementType.kind} elementType: ${elementType}`);
	   if (!elementType) return undefined;

	   switch(elementType.kind) {
             case ValueTypeKind.ANY: return PredefinedArrayType.ArrayAny;
	     case ValueTypeKind.INT: return PredefinedArrayType.ArrayInt;
	     case ValueTypeKind.NUMBER: return PredefinedArrayType.ArrayNumber;
	     case ValueTypeKind.STRING: return PredefinedArrayType.ArrayString;
	   }

	   for (const t of this.types.values()) {
	     //console.log(`==== t: ${t}, elementType: ${elementType}`);
             if (t.kind == ValueTypeKind.ARRAY && (t as ArrayType).element.equals(elementType)) {
	        return t;
	     }
	   }
	   break;
	 }
	 //case TypeKind.MAP
	 case TypeKind.FUNCTION:
	 {
	    const ts_func = type as TSFunction;
	    const retType = this.findValueTypeByType(ts_func.returnType);
	    if (!retType) return undefined;
	    const params: ValueType[] = [];
	    for (const p of ts_func.getParamTypes()) {
              const vt = this.findValueTypeByType(p);
	      if (!vt) return undefined;
	      params.push(vt);
	    }

	    if (retType.kind == ValueTypeKind.VOID &&
		   (params.length == 0 || (params.length == 1 && params[0].kind == ValueTypeKind.VOID))) {
	      return PredefinedFunctionType.FuncVoidVoid;
	    }

	    for (const t of this.types.values()) {
              if (t.kind == ValueTypeKind.FUNCTION) {
                const f = t as FunctionType;
		if (!f.returnType.equals(retType)) continue;
		if (params.length != f.argumentsType.length) continue;
		// TODO has reset paramters
		let i  = 0;
		for (i = 0; i < params.length; i ++) {
                  if (!params[i].equals(f.argumentsType[i]))
		    break;
		}
		if (i == params.length) return t; // found
	      }
	    }
	 }
       }
       return valueType;
    }

    findArrayValueType(type: ValueType) : ValueType | undefined {
      let pretype = GetPredefinedArrayType(type.kind);
      if (pretype) return pretype;

      for (const t of this.types.values()) {
        if (t.kind == ValueTypeKind.ARRAY
	   && (t as ArrayType).element.equals(type))
          return t;
      }
      return undefined;
    } 
    
    findSetValueType(type: ValueType) : ValueType | undefined {
      let pretype = GetPredefinedSetType(type.kind);
      if (pretype) return pretype;
      for (const t of this.types.values()) {
        if (t.kind == ValueTypeKind.SET
	   && (t as SetType).element.equals(type))
          return t;
      }
      return undefined;
    }

    findMapValueType(key: ValueType, value: ValueType) : ValueType | undefined {
      let pretype = GetPredefinedMapType(key.kind, value.kind);
      if (pretype) return pretype;
      for(const t of this.types.values()) {
        if (t.kind == ValueTypeKind.MAP
	   && (t as MapType).key.equals(key)
	   && (t as MapType).value.equals(value))
	   return t;
      }
      return undefined;
    }
}
