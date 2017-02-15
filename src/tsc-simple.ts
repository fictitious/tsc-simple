import * as ts from 'typescript';

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

export type OnWrite = (name: string, text: string) => void;

export interface Compiler {
    compile(source: string, onWrite?: OnWrite): CompileResult;
    compileMap(sources: Map<string, string>, onWrite?: OnWrite): CompileMapResult;
    parse(source: string): CompileResult;
}
export interface CreateCompiler {
    tsconfig?: any;
    basePath?: string; // for resolving relative paths in tsconfig. default is cwd()
    defaultLibFileName?: string;
    defaultLibLocation?: string;
}
export function createCompiler({
    tsconfig,
    basePath,
    defaultLibFileName,
    defaultLibLocation
}: CreateCompiler): Compiler {

    interface SourceText {
        text: string;
        sourceFile: ts.SourceFile;
    }
    type SourceTexts = Map<string, SourceText>;

    let options: ts.CompilerOptions;
    let fileNames: string[] = [];

    if (tsconfig) {
        let diagnostics: ts.Diagnostic[];
        if (tsconfig.extends && !ts.sys.fileExists(tsconfig.extends)) {
            diagnostics = [{
                messageText: `Cannot read file ${tsconfig.extends}`,
                code: 5012
            } as ts.Diagnostic];
        } else {
            ({options, fileNames, errors: diagnostics} = ts.parseJsonConfigFileContent(tsconfig, ts.sys, basePath || ts.sys.getCurrentDirectory(), {}, '<tsconfig>'));
        }
        if (diagnostics.length > 0) {
            throw new Error(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ts.sys.newLine)).join(ts.sys.newLine));
        }
    } else {
        options = ts.getDefaultCompilerOptions();
    }

    const permanentSourceFiles: Map<string, ts.SourceFile> = new Map(); // assuming that files on disk don't change

    function getPermanentSourceFile(fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void): ts.SourceFile {
        let sourceFile = permanentSourceFiles.get(fileName);
        if (!sourceFile) {
            let text = '';
            try {
                text = ts.sys.readFile(fileName);
            } catch(e) {
                if (onError) onError(e.message);
            }
            if (text === undefined) { // returned by sys.readFile when the file does not exist
                const message = `error reading file ${fileName}`;
                if (onError) {
                    onError(message);
                } else {
                    throw new Error(message);
                }
                text = '';
            }

            sourceFile = ts.createSourceFile(fileName, text, languageVersion);
            permanentSourceFiles.set(fileName, sourceFile);
        }
        return sourceFile;
    }

    function getSourceFile(sourceTexts: SourceTexts, fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void): ts.SourceFile {
        let sourceText = sourceTexts.get(fileName);
        if (sourceText !== undefined) {
            return sourceText.sourceFile;
        } else {
            return getPermanentSourceFile(fileName, languageVersion, onError);
        }
    }

    function createSourceTextFile(fileName: string, source: string, languageVersion: ts.ScriptTarget): ts.SourceFile {
        return ts.createSourceFile(fileName, source, languageVersion);
    }

    function readFile(sourceTexts: SourceTexts, fileName: string) {
        let text: string;
        const sourceText = sourceTexts.get(fileName);
        if (sourceText) {
            text = sourceText.text;
        } else {
            const sourceFile = permanentSourceFiles.get(fileName);
            if (sourceFile) {
                text = sourceFile.text;
            } else {
                text = ts.sys.readFile(fileName);
            }
        }
        return text;
    }

    function resolveModuleNames(sourceTexts: SourceTexts, moduleNames: string[], containingFile: string, host: ts.CompilerHost): ts.ResolvedModule[] {
        let prefix = host.getCurrentDirectory();
        if (!prefix.endsWith('/')) {
            prefix = prefix + '/';
        }

        let lookInSourceTexts = false;
        if (containingFile.startsWith(prefix)) {
            let n = containingFile.substring(prefix.length);
            if (sourceTexts.has(n)) {
                lookInSourceTexts = true;
            }
        }

        return moduleNames.map(moduleName => {
            if (lookInSourceTexts) {
                if (sourceTexts.has(moduleName + '.ts')) {
                    return {resolvedFileName: moduleName + '.ts'};
                }
                if (sourceTexts.has(moduleName + '.d.ts')) {
                    return {resolvedFileName: moduleName + '.d.ts'};
                }
            }
            return ts.resolveModuleName(moduleName, containingFile, options, host).resolvedModule!; // so actually the return type really is (ts.ResolvedModule | undefined)[]
        });
    }

    function getCompilerHost(sourceTexts: SourceTexts, onWrite?: OnWrite): ts.CompilerHost {
        return {
            getSourceFile: (fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void) => getSourceFile(sourceTexts, fileName, languageVersion, onError),
            writeFile: (name, text): void => onWrite ? onWrite(name, text) : void 0,
            getDefaultLibFileName: () => `${defaultLibLocation ? `${defaultLibLocation}/` : ''}${defaultLibFileName || 'lib.d.ts'}`,
            getDefaultLibLocation: defaultLibLocation ? (() => defaultLibLocation) : undefined,
            useCaseSensitiveFileNames: () =>  ts.sys.useCaseSensitiveFileNames,
            getCanonicalFileName: (fileName: string):string =>  ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
            getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
            getNewLine: () => ts.sys.newLine,
            fileExists: (fileName: string): boolean => sourceTexts.has(fileName) || permanentSourceFiles.has(fileName) || ts.sys.fileExists(fileName),
            readFile: (fileName: string) => readFile(sourceTexts, fileName),
            directoryExists: (directoryName) => ts.sys.directoryExists(directoryName),
            getDirectories: (path: string): string[] => ts.sys.getDirectories(path),
            resolveModuleNames: function(this: ts.CompilerHost, moduleNames: string[], containingFile: string): ts.ResolvedModule[] {
                return resolveModuleNames(sourceTexts, moduleNames, containingFile, this)
            }
        }
    }

    function formatDiagnostic(d: ts.Diagnostic, sourceFile?: ts.SourceFile): string {
        let fileName = '';
        let lineCol = '';
        if (d.file) {
            fileName = sourceFile && d.file === sourceFile ? '<source>' : d.file.fileName;
            if (d.start >= 0) {
                const p = d.file.getLineAndCharacterOfPosition(d.start);
                lineCol = `(${p.line + 1},${p.character + 1}): `;
            }
        }
        const category = ts.DiagnosticCategory[d.category];
        const message = ts.flattenDiagnosticMessageText(d.messageText, ts.sys.newLine);
        return `${fileName}${lineCol}${category} TS${d.code}: ${message}`;
    }

    interface GetProgramDiagnostics {
        program: ts.Program;
        sourceTexts: SourceTexts;
        parseOnly: boolean;
    }
    function getProgramDiagnostics({program, sourceTexts, parseOnly}: GetProgramDiagnostics): Diagnostic[] {
        let diagnostics: Diagnostic[] = [...program.getOptionsDiagnostics().map((d): Diagnostic => ({...d, diagnosticType: 'option'}))];
        if (!parseOnly) {
            diagnostics.push(...program.getGlobalDiagnostics().map((d): Diagnostic => ({...d, diagnosticType: 'global'})));
        }
        sourceTexts.forEach(sourceText => {
            const sourceFile = sourceText.sourceFile;
            diagnostics.push(...program.getSyntacticDiagnostics(sourceFile).map((d): Diagnostic => ({...d, diagnosticType: 'syntactic'})));
            if (!parseOnly) {
                diagnostics.push(...program.getSemanticDiagnostics(sourceFile).map((d): Diagnostic => ({...d, diagnosticType: 'semantic'})));
                diagnostics.push(...program.getDeclarationDiagnostics(sourceFile).map((d): Diagnostic => ({...d, diagnosticType: 'declaration'})));
            }
        });
        return diagnostics;
    }

    function getSourceFileNames(sourceTexts: SourceTexts): string[] {
        return [...sourceTexts.keys(), ...permanentSourceFiles.keys()];
    }

    interface CompileOrParseSource {
        source: string;
        onWrite?: OnWrite;
        parseOnly: boolean;
    }
    function compileOrParseSource({source, onWrite, parseOnly}: CompileOrParseSource): CompileResult {
        const sourceName = '$.ts';
        const r = compileOrParseMap({sources: new Map([[sourceName, source]]), onWrite, parseOnly});
        const sourceFile = r.getSourceFile(sourceName);
        return {
            ...r,
            sourceFile,
            formatDiagnostic: (d: ts.Diagnostic) => formatDiagnostic(d, sourceFile)
        };
    }

    function compile(source: string, onWrite?: OnWrite): CompileResult {
        return compileOrParseSource({source, onWrite, parseOnly: false});
    }

    function parse(source: string): CompileResult {
        return compileOrParseSource({source, parseOnly: true});
    }


    interface CompileOrParseMap {
        sources: Map<string, string>;
        onWrite?: OnWrite;
        parseOnly: boolean;
    }
    function compileOrParseMap({sources, onWrite, parseOnly}: CompileOrParseMap): CompileMapResult {
        const languageVersion = options.target || ts.ScriptTarget.ES2015;
        const sourceTexts: SourceTexts = new Map<string, SourceText>();
        sources.forEach((source: string, name: string) => {
            sourceTexts.set(name, {text: source, sourceFile: createSourceTextFile(name, source, languageVersion)});
        });
        const program = ts.createProgram([...fileNames, ...sourceTexts.keys()], options, getCompilerHost(sourceTexts, onWrite));
        if (!parseOnly) {
            program.emit();
        }
        return {
            program,
            diagnostics: getProgramDiagnostics({program, sourceTexts, parseOnly}),
            formatDiagnostic: (d: ts.Diagnostic) => formatDiagnostic(d),
            getSourceFileNames: () => getSourceFileNames(sourceTexts),
            getSourceFile: (n: string) => getSourceFile(sourceTexts, n, languageVersion)
        }
    }

    function compileMap(sources: Map<string, string>, onWrite?: OnWrite): CompileMapResult {
        return compileOrParseMap({sources, onWrite, parseOnly: false});
    }

    return {compile, parse, compileMap};
}
