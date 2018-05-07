
import * as ts from 'typescript';

declare module 'typescript' {

    export function createMap<T>(): ts.Map<T>;
    export function getRootLength(path: string): number;
    export function normalizePath(path: string): string;
    export function getDirectoryPath(path: ts.Path): ts.Path;
    export function getDirectoryPath(path: string): string;
    export function getNewLineCharacter(options: ts.CompilerOptions): string;
    export function combinePaths(path1: string, path2: string): string;
    export function memoize<T>(callback: () => T): () => T;
    export function isWatchSet(options: ts.CompilerOptions): boolean;

    export interface System {
        getEnvironmentVariable?(name: string): string;
    }
}


interface OutputFingerprint {
    hash: string;
    byteOrderMark: boolean;
    mtime: Date;
}

function createCompilerHost(sys: ts.System, options: ts.CompilerOptions, setParentNodes?: boolean): ts.CompilerHost {
    const existingDirectories = ts.createMap<boolean>();

    function getCanonicalFileName(fileName: string): string {
        // if underlying system can distinguish between two files whose names differs only in cases then file name already in canonical form.
        // otherwise use toLowerCase as a canonical form.
        return sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
    }

    function getSourceFile(fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void): ts.SourceFile {
        let text: string | undefined;
        try {
            text = sys.readFile(fileName, options.charset);
        }
        catch (e) {
            if (onError) {
                onError(e.message);
            }
            text = "";
        }

        return ts.createSourceFile(fileName, text || '', languageVersion, setParentNodes)
    }

    function directoryExists(directoryPath: string): boolean {
        if (existingDirectories.has(directoryPath)) {
            return true;
        }
        if (sys.directoryExists(directoryPath)) {
            existingDirectories.set(directoryPath, true);
            return true;
        }
        return false;
    }

    function ensureDirectoriesExist(directoryPath: string) {
        if (directoryPath.length > ts.getRootLength(directoryPath) && !directoryExists(directoryPath)) {
            const parentDirectory = ts.getDirectoryPath(directoryPath);
            ensureDirectoriesExist(parentDirectory);
            sys.createDirectory(directoryPath);
        }
    }

    let outputFingerprints: ts.Map<OutputFingerprint>;

    function writeFileIfUpdated(fileName: string, data: string, writeByteOrderMark: boolean): void {
        if (!outputFingerprints) {
            outputFingerprints = ts.createMap<OutputFingerprint>();
        }

        const hash = sys.createHash!(data);
        const mtimeBefore = sys.getModifiedTime!(fileName);

        if (mtimeBefore) {
            const fingerprint = outputFingerprints.get(fileName);
            // If output has not been changed, and the file has no external modification
            if (fingerprint &&
                fingerprint.byteOrderMark === writeByteOrderMark &&
                fingerprint.hash === hash &&
                fingerprint.mtime.getTime() === mtimeBefore.getTime()) {
                return;
            }
        }

        sys.writeFile(fileName, data, writeByteOrderMark);

        const mtimeAfter = sys.getModifiedTime!(fileName);

        outputFingerprints.set(fileName, {
            hash,
            byteOrderMark: writeByteOrderMark,
            mtime: mtimeAfter
        });
    }

    function writeFile(fileName: string, data: string, writeByteOrderMark: boolean, onError?: (message: string) => void) {
        try {
            ensureDirectoriesExist(ts.getDirectoryPath(ts.normalizePath(fileName)));

            if (ts.isWatchSet(options) && sys.createHash && sys.getModifiedTime) {
                writeFileIfUpdated(fileName, data, writeByteOrderMark);
            }
            else {
                sys.writeFile(fileName, data, writeByteOrderMark);
            }

        }
        catch (e) {
            if (onError) {
                onError(e.message);
            }
        }
    }

    function getDefaultLibLocation(): string {
        return ts.getDirectoryPath(ts.normalizePath(sys.getExecutingFilePath()));
    }

    const newLine = ts.getNewLineCharacter(options);
    const realpath = sys.realpath && ((path: string) => sys.realpath!(path));

    return {
        getSourceFile,
        getDefaultLibLocation,
        getDefaultLibFileName: options => ts.combinePaths(getDefaultLibLocation(), ts.getDefaultLibFileName(options)),
        writeFile,
        getCurrentDirectory: ts.memoize(() => sys.getCurrentDirectory()),
        useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames,
        getCanonicalFileName,
        getNewLine: () => newLine,
        fileExists: fileName => sys.fileExists(fileName),
        readFile: fileName => sys.readFile(fileName),
        trace: (s: string) => sys.write(s + newLine),
        directoryExists: directoryName => sys.directoryExists(directoryName),
        getEnvironmentVariable: name => sys.getEnvironmentVariable ? sys.getEnvironmentVariable(name) : "",
        getDirectories: (path: string) => sys.getDirectories(path),
        realpath
    };
}

export {createCompilerHost};