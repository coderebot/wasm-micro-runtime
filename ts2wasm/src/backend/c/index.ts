/*
 * Copyright (C) 2023 Xiaomi Corporation.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import ts from 'typescript';
import { FunctionKind, TSFunction, TSClass } from '../../type.js';
import { builtinTypes, Type, TypeKind } from '../../type.js';
import { Variable } from '../../variable.js';
import {
    FunctionScope,
    GlobalScope,
    ClassScope,
    ScopeKind,
    Scope,
    ClosureEnvironment,
    BlockScope,
    NamespaceScope,
} from '../../scope.js';
import { Stack } from '../../utils.js';
import { ArgNames, BuiltinNames } from '../../../lib/builtin/builtin_name.js';
import { Ts2wasmBackend, ParserContext, DataSegmentContext } from '../index.js';
import { Logger } from '../../log.js';
import { ModuleNode } from '../../semantics/semantics_nodes.js';
import { BuildModuleNode } from '../../semantics/index.js';
import { CreateDefaultDumpWriter } from '../../semantics/dump.js';

export class CCodeGen extends Ts2wasmBackend {
    private dataSegmentContext = new DataSegmentContext();
    private module: ModuleNode | undefined;

    constructor(parserContext: ParserContext) {
        super(parserContext);
    }

    public codegen(options?: any): void {
        this.genModule();
        this.genCCode();
    }

    public emitBinary(options?: any): Uint8Array {
        return new Uint8Array(0);
    }
    public emitText(options?: any): string {
        return '/* Generate the C code */';
    }
    public dispose(): void {}

    genCCode() {}

    genModule() {
        this.module = BuildModuleNode(this.parserContext);
        this.module!.dump(CreateDefaultDumpWriter());
	this.module!.dumpCodeTrees(CreateDefaultDumpWriter());
    }
}
