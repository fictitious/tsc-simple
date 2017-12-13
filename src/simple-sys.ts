
import * as ts from 'typescript';

export type OnWrite = (name: string, text: string) => void;

function createSimpleSys(sys: ts.System, sources: Map<string, string>, onWrite?: OnWrite): ts.System {

    [...sources.keys()].forEach(n => {
        if (n.indexOf('/') >= 0) {
            throw new Error(`source name may not contain /: ${n}`);
        }
    });

    let cwd = sys.getCurrentDirectory();
    if (!cwd.endsWith('/')) {
        cwd += '/';
    }

    return Object.assign({}, sys, {
        readFile(path: string): string | undefined {
            const sourceName = getRelativeCwdName(cwd, path);
            if (sourceName && sources.has(sourceName)) {
                return sources.get(sourceName);
            } else {
                return sys.readFile(path);
            }
        },
        writeFile(path: string, data: string, writeByteOrderMark?: boolean): void {
            onWrite && onWrite(path, data);
        },
        fileExists(path: string): boolean {
            const sourceName = getRelativeCwdName(cwd, path);
            return (sourceName && sources.has(sourceName)) || sys.fileExists(path);
        },
        createDirectory(path: string) {
            throw new Error(`createDirectory: not allowed`);
        },

        // readDirectory is not composable and can not be extended, only reimplemented.
        // fortunately that's not necessary for this to work
    });
}

function getRelativeCwdName(cwd: string, path: string): string | undefined {
    if (path.startsWith('./')) {
        return path.substring(2);
    } else if (path.startsWith(cwd)) {
        return path.substring(cwd.length);
    } else if (!path.startsWith('/')) {
        return path;
    } else {
        return undefined;
    }
}


export {createSimpleSys};
