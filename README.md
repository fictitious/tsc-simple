# Minimal usable interface for TypeScript compiler

    $ npm install tsc-simple

### create compiler with default options and default library, compile a string

```typescript
import {createCompiler, CompileResult} from 'tsc-simple';

const compiler = createCompiler({defaultLibLocation: 'node_modules/typescript/lib'});

const r: CompileResult = compiler.compile('let x = 3 + 2');

```

the following properties and methods are available in `CompileResult`:
```typescript
    sourceFile: ts.SourceFile;
    diagnostics: Diagnostic[];
    program: ts.Program;
    formatDiagnostic(d: ts.Diagnostic): string;
    getSourceFileNames(): string[];
    getSourceFile(name: string): ts.SourceFile;

```

`tsc-simple` compiler does not write any files. If you need to obtain generated javascript,
declaration files, or sourcemaps, you have to provide `onOutput` callback as the second argument to `compile`:
```typescript
    const out: {[name: string]: string} = {};

    const r = compiler.compile('let x = 3 + 2', (name, text) => {out[name] = text});
```

### create compiler with specific options and library files

```typescript
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
    const messages = r.diagnostics.map(d => r.formatDiagnostic(d));
    console.dir(messages);     // ['<source>(1,9): Error TS2304: Cannot find name \'z\'.']


```

### compile two modules, one importing another

```typescript
    const r = compiler.compileMap(new Map([
        ['A.ts', 'export class A {}'],
        ['B.ts', `import {A} from 'A'; export class B extends A {}`]
    ]));
```

### check syntax only, without name binding, type checking and emitting

```typescript
    const r = compiler.parse('let x = z + 2');
    console.log(r.diagnostics.length); // 0 = no errors
```