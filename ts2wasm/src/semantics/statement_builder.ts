/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';

import { Logger } from '../log.js';	
import {
    buildExpression,
    newCastValue,
    newBinaryExprValue,
} from './expression_builder.js';

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

import { Variable, ModifierKind } from '../variable.js';

import { Scope } from '../scope.js';

import {
    Statement,
    IfStatement,
    BlockStatement,
    ReturnStatement,
    BaseLoopStatement,
    ForStatement,
    ExpressionStatement,
    EmptyStatement,
    CaseClause,
    DefaultClause,
    CaseBlock,
    SwitchStatement,
    BreakStatement,
    VariableStatement
} from '../statement.js';

import {
    SemanticsValue,
    SemanticsValueKind,
    VarValue,
    VarValueKind,
} from './value.js';

import {
    ValueType,
    Primitive,
    PrimitiveType
} from './value_types.js'

import {
    BuildContext,
    SymbolValue,
    SymbolKey,
    SymbolKeyToString,
    ValueReferenceKind,
} from './builder_context.js'; 

function CreateFromVariable(v: Variable, as_global: boolean, context: BuildContext) : VarDeclareNode {
  let storageType : VarStorageType = as_global ?
                     SemanticsValueKind.GLOBAL_CONST :
                     SemanticsValueKind.LOCAL_CONST;
  if (v.isConst() || v.isReadOnly()) {
    if (v.varIsClosure)
      storageType = SemanticsValueKind.CLOSURE_CONST;
    } else {
      if (v.varIsClosure)
        storageType = SemanticsValueKind.CLOSURE_VAR;
      else if (as_global)
        storageType = SemanticsValueKind.GLOBAL_VAR;
      else
        storageType = SemanticsValueKind.LOCAL_VAR;
   }

   return new VarDeclareNode(storageType,
			     context.module.findValueTypeByType(v.varType)!,
			     v.varName,
			     v.varIndex, 0);
}

export function createLocalSymbols(scope: Scope, context: BuildContext)
   : [VarDeclareNode[] | undefined, Map<SymbolKey, SymbolValue> | undefined] {
  let varList: VarDeclareNode[] | undefined = undefined;
  let symbols : Map<SymbolKey, SymbolValue> | undefined = undefined;

  const vararr = scope!.varArray;
  if (vararr.length > 0) {
    symbols = new Map<SymbolKey, SymbolValue>();
    varList = [];
    for (const v of vararr) {
      const node = CreateFromVariable(v, false, context);
      const value = new VarValue(node.storageType, node.type, node, node.index); 
      //Logger.info(`=== var ${v.varName} value: ${value}`);
      console.log(`=== createLocalSymbols ${SymbolKeyToString(v)} value: ${value.toString()}`);
      symbols.set(v, value);
    }
  }
  return [varList, symbols];
}


function buildBlock(block: BlockStatement, context: BuildContext) : SemanticsNode {
  const scope = block.getScope();
  const [statements, varList] = buildStatementsWithScope(scope!, scope!.statements, context);

  return new BlockNode(statements, varList);
}

function buildStatementsWithScope(scope: Scope, statementsFrom: Statement[], context: BuildContext) : [SemanticsNode[], VarDeclareNode[] | undefined] {
  const statements : SemanticsNode[] = [];
  let basic_block : BasicBlockNode | undefined = undefined;


  const [varList, symbols] = createLocalSymbols(scope, context);

  //if (symbols)
  //    symbols!.forEach((v, k) => console.log(`== block local ${SymbolKeyToString(k)}, ${v.toString()}`));

  context.push(scope, symbols);
  for (const st of statementsFrom) {
    const r = buildStatement(st, context);
    if (r instanceof SemanticsValue) {
      if (!basic_block) {
        basic_block = new BasicBlockNode();
	statements.push(basic_block);
      }
      basic_block.pushSemanticsValue(r as SemanticsValue);
    } else {
      basic_block = undefined;
      const node = r as SemanticsNode;
      statements.push(node);
    }
  }

  context.pop();

  return [statements, varList];
}

function buildCaseClauseStatements(clause: CaseClause | DefaultClause, context: BuildContext) : SemanticsNode {
  const scope = clause.getScope();
  const [statements, varList] = buildStatementsWithScope(scope!, clause.caseStatements, context);

  return new BlockNode(statements, varList);
}

function buildVariableStatement(statement: VariableStatement, context: BuildContext) : SemanticsNode {
  const basic_block = new BasicBlockNode();
  for (const v of statement.varArray) {
    if (v.initExpression != null) {
      const ret = context.findSymbol(v.varName);
      if (!ret) {
        throw Error(`var ${v.varName} is not decleared`);
      }

      let var_value : VarValue | undefined = undefined;

      if (ret instanceof VarDeclareNode) {
        const var_decl = ret as VarDeclareNode;
        var_value = new VarValue(var_decl.storageType as VarValueKind, 
			var_decl.type,
			var_decl,
			var_decl.index);
      } else if (ret instanceof VarValue) {
        var_value = ret as VarValue;
      } else {
	throw Error(`var ${v.varName} unexcept type ${ret}`);
      }

      context.pushReference(ValueReferenceKind.RIGHT);
      const init_value = buildExpression(v.initExpression, context);
      context.popReference();
      basic_block.pushSemanticsValue(newBinaryExprValue(var_value!.type,
				ts.SyntaxKind.EqualsToken,
				var_value!,
				init_value));
    }
  }
  return basic_block;
}

function buildStatementAsNode(statement: Statement, context: BuildContext) : SemanticsNode {
  const r = buildStatement(statement, context);
  if (r instanceof SemanticsValue) {
     const b = new BasicBlockNode();
     b.pushSemanticsValue(r as SemanticsValue);
     return b;
  }
  return r as SemanticsNode;
}

function buildIfStatement(statement: IfStatement, context: BuildContext) : SemanticsNode {
  context.pushReference(ValueReferenceKind.LEFT);
  let condition = buildExpression(statement.ifCondition, context);
  context.popReference();

  condition = newCastValue(Primitive.Boolean, condition);

  const trueStmt = buildStatementAsNode(statement.ifIfTrue, context);
  let falseStmt : SemanticsNode | undefined = undefined;
  if (statement.ifIfFalse != null)
    falseStmt = buildStatementAsNode(statement.ifIfFalse, context);
  
  return new IfNode(condition, trueStmt, falseStmt);
}

function buildReturnStatement(statement: ReturnStatement, context: BuildContext) : SemanticsNode {
  context.pushReference(ValueReferenceKind.RIGHT);
  const returnvalue = statement.returnExpression != null ?  buildExpression(statement.returnExpression!, context) : undefined;
  context.popReference();
  return new ReturnNode(returnvalue);
}

function buildBaseLoopStatement(statement: BaseLoopStatement, context: BuildContext) : SemanticsNode {
  context.pushReference(ValueReferenceKind.RIGHT);
  let condition = buildExpression(statement.loopCondtion, context);
  context.popReference();
  condition = newCastValue(Primitive.Boolean, condition);

  const body = buildStatementAsNode(statement.loopBody, context);
  
  return new WhileNode(statement.statementKind == ts.SyntaxKind.WhileStatement ?
		       SemanticsKind.WHILE : SemanticsKind.DOWHILE,
                       condition,
		       body);
}

function buildForStatement(statement: ForStatement, context: BuildContext) : SemanticsNode {
  // TODO process var
  console.log(`==== statement: scope: ${SymbolKeyToString(statement.getScope()!)}`);
  const scope = statement.getScope()!;
  const [varList, symbols] = createLocalSymbols(scope, context);
  context.push(scope, symbols);
  const initialize = statement.forLoopInitializer != null ?
  	      buildStatementAsNode(statement.forLoopInitializer, context) : undefined;

  context.pushReference(ValueReferenceKind.RIGHT);
  const condition = statement.forLoopCondtion != null ?
	       buildExpression(statement.forLoopCondtion, context) : undefined;

  const next = statement.forLoopIncrementor != null ?
	       buildExpression(statement.forLoopIncrementor, context) : undefined;
  context.popReference();

  const body = buildStatementAsNode(statement.forLoopBody, context);

  context.pop();

  return new ForNode(varList, initialize, condition, next, body);
}

function buildSwitchStatement(statement: SwitchStatement, context: BuildContext) : SemanticsNode {
  context.pushReference(ValueReferenceKind.RIGHT);
  const condition = buildExpression(statement.switchCondition, context);
  context.popReference();

  const case_block = statement.switchCaseBlock as CaseBlock;

  const case_nodes : CaseClauseNode[] = [];
  let default_node : DefaultClauseNode | undefined = undefined;

  for (const clause of case_block.caseCauses) {
    if (clause.statementKind == ts.SyntaxKind.DefaultClause) {
       default_node = new DefaultClauseNode(
	       buildCaseClauseStatements((clause as DefaultClause), context));
    } else {
       const case_clause = clause as CaseClause;
       context.pushReference(ValueReferenceKind.RIGHT);
       const case_expr = buildExpression(case_clause.caseExpr, context);
       context.popReference();
       case_nodes.push(new CaseClauseNode(case_expr,
			buildCaseClauseStatements(case_clause, context)));
    }
  }

  return  new SwitchNode(condition, case_nodes, default_node);
}

export function buildStatement(statement: Statement, context: BuildContext) : SemanticsNode | SemanticsValue {
    console.log(`======= buildStatement: ${ts.SyntaxKind[statement.statementKind]}`);
    try {
      switch(statement.statementKind) {
        case ts.SyntaxKind.Block:
            return buildBlock(statement as BlockStatement, context);
        case ts.SyntaxKind.IfStatement:
	    return buildIfStatement(statement as IfStatement, context);
        case ts.SyntaxKind.ReturnStatement:
	    return buildReturnStatement(statement as ReturnStatement, context);
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.WhileStatement:
            return buildBaseLoopStatement(statement as BaseLoopStatement, context);
        case ts.SyntaxKind.ForStatement:
	    return buildForStatement(statement as ForStatement, context);
	case ts.SyntaxKind.ForInStatement:
	case ts.SyntaxKind.ForOfStatement:
	    // TODO
	    break;
        case ts.SyntaxKind.ExpressionStatement:
            return buildExpression((statement as ExpressionStatement).expression, context);
        case ts.SyntaxKind.CaseClause:
	    //return buildCaseClauseStatement(statement as CaseClause, context);
        case ts.SyntaxKind.DefaultClause:
	    //return buildDefaultClauseStatement(statement as DefaultClause, context);
	    break; // call it in buildCaseClauseStatements
        case ts.SyntaxKind.SwitchStatement:
	    return buildSwitchStatement(statement as SwitchStatement, context);
        case ts.SyntaxKind.CaseBlock:
	    break; // call it in buildSwitchStatement statement
        case ts.SyntaxKind.BreakStatement:
	case ts.SyntaxKind.ContinueStatement:
	    // TODO
	    break;
        case ts.SyntaxKind.VariableStatement:
            return buildVariableStatement(statement as VariableStatement, context);
        case ts.SyntaxKind.EmptyStatement:
            return new EmptyNode();
      }
    }
    catch(e: any) {
     console.log(e.message);
     const tsNode = statement.tsNode!;
     const sourceFile = tsNode.getSourceFile();
     const start = tsNode.getStart(sourceFile);
     const startLineInfo = sourceFile.getLineAndCharacterOfPosition(start);
     console.log(`[ERROR] @ "${sourceFile.fileName}" line: ${startLineInfo.line + 1} @${startLineInfo.character}  end: ${tsNode.getEnd()}  width: ${tsNode.getWidth(sourceFile)}`);
     console.log(`Source: ${tsNode.getFullText(sourceFile)}`);


    }
  
    return new EmptyNode();
}
