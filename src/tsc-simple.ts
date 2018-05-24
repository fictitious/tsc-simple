import * as ts from 'typescript';

import {createSimpleSys, OnWrite} from './simple-sys';
import {createCompilerHost} from './compiler-host';

export type DiagnosticType = 'option' | 'global' | 'syntactic' | 'semantic' | 'declaration';

export interface Diagnostic extends ts.Diagnostic {
    diagnosticType: DiagnosticType;
}

export interface CompileResult extends CompileMapResult {
    sourceFile: ts.SourceFile;
}

export interface CompileMapResult {
    diagnostics: Diagnostic[];
    program: ts.Program;
    formatDiagnostic(d: ts.Diagnostic): string;
    getSourceFileNames(): string[];
    getSourceFile(name: string): ts.SourceFile;
}


function parseTsConfig(tsInstance: typeof ts, system: ts.System, tsconfig?: {files?: string[], include?: string[]}, basePath?: string, configFileName?: string): {options: ts.CompilerOptions, fileNames: string[], errors: ts.Diagnostic[]} {
    if (tsconfig) {
        const config = tsconfig.files || tsconfig.include ? tsconfig : {...tsconfig, include: []}; // stop it from scanning and adding all ts files from current directory
        const {options, fileNames, errors} = tsInstance.parseJsonConfigFileContent(config, system, basePath || system.getCurrentDirectory(), {}, configFileName || '<tsconfig>');
        return {options, fileNames, errors: errors.filter(e => e.code !== 18003)}; // no input files is not an error here
    } else {
        return {options: tsInstance.getDefaultCompilerOptions(), fileNames: [], errors: []};
    }
}

function formatDiagnostic(tsInstance: typeof ts, d: ts.Diagnostic, system: ts.System, theOnlySourceFile?: ts.SourceFile): string {
    let fileName = '';
    let lineCol = '';
    if (d.file) {
        fileName = theOnlySourceFile && d.file === theOnlySourceFile ? '<source>' : d.file.fileName;
        if (d.start! >= 0) {
            const p = d.file.getLineAndCharacterOfPosition(d.start!);
            lineCol = `(${p.line + 1},${p.character + 1}): `;
        }
    }
    const category = tsInstance.DiagnosticCategory[d.category];
    const message = tsInstance.flattenDiagnosticMessageText(d.messageText, system.newLine);
    return `${fileName}${lineCol}${category} TS${d.code}: ${message}`;
}


export interface GetProgramDiagnostics {
    program: ts.Program;
    parseOnly?: boolean;
}
function getProgramDiagnostics({program, parseOnly}: GetProgramDiagnostics): Diagnostic[] {
    let diagnostics: Diagnostic[] = [...program.getOptionsDiagnostics().map((d): Diagnostic => ({...d, diagnosticType: 'option'}))];
    if (!parseOnly) {
        diagnostics.push(...program.getGlobalDiagnostics().map((d): Diagnostic => ({...d, diagnosticType: 'global'})));
    }
    program.getSourceFiles().forEach(sourceFile => {
        diagnostics.push(...program.getSyntacticDiagnostics(sourceFile).map((d): Diagnostic => ({...d, diagnosticType: 'syntactic'})));
        if (!parseOnly) {
            diagnostics.push(...program.getSemanticDiagnostics(sourceFile).map((d): Diagnostic => ({...d, diagnosticType: 'semantic'})));
            if (program.getCompilerOptions().declaration) {
                diagnostics.push(...program.getDeclarationDiagnostics(sourceFile).map((d): Diagnostic => ({...d, diagnosticType: 'declaration'})));
            }
        }
    });
    return diagnostics;
}


interface CompileOrParseFiles {
    tsInstance: typeof ts;
    options: ts.CompilerOptions;
    fileNames: string[];
    theOnlySourceFileName?: string;
    system: ts.System;
    parseOnly: boolean;
}
function compileOrParseFiles({tsInstance, options, fileNames, theOnlySourceFileName, system, parseOnly}: CompileOrParseFiles): CompileMapResult {

    const host = createCompilerHost({tsInstance, sys: system, options});
    const program = tsInstance.createProgram(fileNames, options, host);
    if (!parseOnly) {
        program.emit();
    }
    const theOnlySourceFile = theOnlySourceFileName ? program.getSourceFile(theOnlySourceFileName) : undefined;
    return {
        program,
        diagnostics: getProgramDiagnostics({program, parseOnly}),
        formatDiagnostic: (d: ts.Diagnostic) => formatDiagnostic(tsInstance, d, system, theOnlySourceFile),
        getSourceFileNames: () => program.getSourceFiles().map(s => s.fileName),
        getSourceFile: (n: string) => program.getSourceFile(n)
    }
}


interface CompileOrParseSources {
    tsInstance: typeof ts;
    sources: Map<string, string>;
    options: ts.CompilerOptions;
    fileNames: string[];
    theOnlySourceFileName?: string;
    system: ts.System;
    onWrite?: OnWrite;
    parseOnly: boolean;
}
function compileOrParseSources({tsInstance, sources, options, fileNames, theOnlySourceFileName, system, onWrite, parseOnly}: CompileOrParseSources): CompileMapResult {
    const simpleSys = createSimpleSys(system, sources, onWrite);
    return compileOrParseFiles({tsInstance, options, fileNames: [...sources.keys(), ...fileNames], theOnlySourceFileName, system: simpleSys, parseOnly});
}


interface CompileOrParseSource {
    tsInstance: typeof ts;
    source: string;
    options: ts.CompilerOptions;
    fileNames: string[];
    system: ts.System;
    onWrite?: OnWrite;
    parseOnly: boolean;
}
function compileOrParseSource({tsInstance, source, options, fileNames, system, onWrite, parseOnly}: CompileOrParseSource) {
    const theOnlySourceFileName = '$.ts';
    const r = compileOrParseSources({tsInstance, sources: new Map([[theOnlySourceFileName, source]]), options, fileNames, theOnlySourceFileName, system, onWrite, parseOnly});
    return {
        ...r,
        sourceFile: r.getSourceFile(theOnlySourceFileName)
    };
}


export interface Compiler {
    compile(source: string, onWrite?: OnWrite): CompileResult;
    compileMap(sources: Map<string, string>, onWrite?: OnWrite): CompileMapResult;
    parse(source: string): CompileResult;
}
export interface CreateCompiler {
    tsInstance: typeof ts;
    tsconfig?: any;
    basePath?: string; // for resolving relative paths in tsconfig. default is cwd()
    sys?: ts.System;
}
function createCompiler({tsInstance, tsconfig, basePath, sys}: CreateCompiler): Compiler {

    const system = sys || tsInstance.sys;

    const {options, fileNames, errors} = parseTsConfig(tsInstance, system, tsconfig, basePath);
    if (errors.length > 0) {
        throw new Error(errors.map(d => tsInstance.flattenDiagnosticMessageText(d.messageText, system.newLine)).join(system.newLine));
    }

    return {
        compile(source: string, onWrite?: OnWrite): CompileResult {
            return compileOrParseSource({tsInstance, source, options, fileNames, system, onWrite, parseOnly: false});
        },

        parse(source: string): CompileResult {
            return compileOrParseSource({tsInstance, source, options, fileNames, system, parseOnly: true});
        },

        compileMap(sources: Map<string, string>, onWrite?: OnWrite): CompileMapResult {
            return compileOrParseSources({tsInstance, sources, options, fileNames, system, onWrite, parseOnly: false})
        }
    };
}

export {parseTsConfig, formatDiagnostic, getProgramDiagnostics, createCompiler};

