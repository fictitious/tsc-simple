
import * as ts from 'typescript';
import {createCompiler} from './tsc-simple';

import {assert} from 'chai';

suite('tsc-simple', function() {

    this.timeout(5000);

    const tsInstance = ts;

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

    test('a', function() {
        const compiler = createCompiler({tsInstance, tsconfig});

        const out1: {[name: string]: string} = {};

        const r1 = compiler.compile('let x = 3 + 2', (name, text) => {out1[name] = text});
        assert.deepEqual(r1.diagnostics, []);
        assert.deepEqual(out1, {
            '$.js': 'var x = 3 + 2;\n',
            '$.d.ts': 'declare let x: number;\n'
        });
        assert.lengthOf(r1.sourceFile.statements, 1);
        assert.equal(r1.sourceFile.statements[0].kind, tsInstance.SyntaxKind.VariableStatement);
        const nn = r1.getSourceFileNames();
        nn.forEach(n => {
            if (n != '$.ts' && !n.endsWith('lib.es5.d.ts') && !n.endsWith('lib.es2015.core.d.ts')) {
                assert.isOk(false, `unexpected file in getSourceFileNames(): ${n}`);
            }
        });

        const r2 = compiler.compile('let x = z + 2');
        assert.lengthOf(r2.diagnostics, 1);
        assert.equal(r2.formatDiagnostic(r2.diagnostics[0]), '<source>:1:9 - error TS2304: Cannot find name \'z\'.');

        const r3 = compiler.compileMap(new Map([['A.ts', 'export class A {}'], ['B.ts', `import {A} from './A'; export class B extends A {}`]]));
        assert.lengthOf(r3.diagnostics, 0);
    });

    test('b', function() {
        const compiler = createCompiler({tsInstance});
        const r = compiler.compile('let x = 3 + 2');
        assert.deepEqual(r.diagnostics, []);
    });

    test('c', function() {
        const compiler = createCompiler({tsInstance, tsconfig: {compilerOptions: {lib: ['es6']}}});
        const r = compiler.compile('let x = 3 + 2');
        assert.deepEqual(r.diagnostics, []);
    });

    test('d', function() {
        const compiler = createCompiler({tsInstance});
        const r = compiler.compile('let x = 3 + 2');
        assert.deepEqual(r.diagnostics, []);
    });

    test('e', function() {
        const compiler = createCompiler({tsInstance, tsconfig: {compilerOptions: {lib:[]}}});
        const r = compiler.parse('let x = z + 2');
        assert.deepEqual(r.diagnostics, []);
        assert.lengthOf(r.sourceFile.statements, 1);
        assert.equal(r.sourceFile.statements[0].kind, tsInstance.SyntaxKind.VariableStatement);
    });

});