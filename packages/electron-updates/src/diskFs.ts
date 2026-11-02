import * as fs from 'node:fs';
import { createRequire } from 'node:module';

/** Update bundles contain ASAR files; read and write their bytes without Electron's virtual archive filesystem. */
const diskFs: typeof fs = process.versions.electron ? createRequire(import.meta.url)('original-fs') : fs;

export const { chmod, lstat, mkdir, open, readdir, rm, symlink } = diskFs.promises;
