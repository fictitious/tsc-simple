# Minimal usable interface for TypeScript compiler

```
npm install tsc-simple
```

## create compiler with default options and default library, compile a string

```
import {createCompiler, CompileResult} from 'tsc-simple';

const compiler = createCompiler({defaultLibLocation: 'node_modules/typescript/lib'});

const r: CompileResult = compiler.compile('let x = 3 + 2');

```

the following properties and methods are available in CompileResult:
```
    sourceFile: ts.SourceFile;
    diagnostics: Diagnostic[];
    program: ts.Program;
    formatDiagnostic(d: ts.Diagnostic): string;
    getSourceFileNames(): string[];
    getSourceFile(name: string): ts.SourceFile;

```

## create compiler with specific options and library files

```
    const tsconfig = {
        "compilerOptions": {
            "declaration": true,
            "noLib": true,
            "typeRoots": []
        },
        "files": [
            "node_modules/typescript/lib/lib.es5.d.ts",
            "node_modules/typescript/lib/lib.es2015.core.d.ts"
        ]
    };

    const compiler = createCompiler({tsconfig});

    const r = compiler.compile('let x = z + 2');
    const dd = r.diagnostics.map(d => r.formatDiagnostic(d));
    console.dir(dd);     // ['<source>(1,9): Error TS2304: Cannot find name \'z\'.']


```

## compile two modules, one importing another

```
    const r = compiler.compileMap(new Map([
        ['A.ts', 'export class A {}'],
        ['B.ts', `import {A} from 'A'; export class B extends A {}`]
    ]));
```