import type { Plugin, Rollup } from 'vite';

/**
 * Lib mode extracts CSS to an asset the JS entry never imports, so `import`-condition
 * consumers get no styles. This plugin splices that import into the entry.
 */
/** Inserted at the position the entry's own source gives it, so both conditions share one cascade order. */

const CSS_FILE = /\.css(\?|$)/;
// Rollup emits each hoisted import of an ESM chunk on its own line, at the top of the chunk.
const OUTPUT_IMPORT_LINE = /^import\s+(?:.*?\sfrom\s+)?['"]([^'"]+)['"];?$/;
// A sourcemap line entry is empty when the generated line maps to nothing.
const UNMAPPED_LINE = '';
const MAPPINGS_LINE_SEPARATOR = ';';

/** Insert one unmapped generated line at `line`, keeping every later line aligned. */
function spliceUnmappedLine(mappings: string, line: number): string {
  const lines = mappings.split(MAPPINGS_LINE_SEPARATOR);
  lines.splice(line, 0, UNMAPPED_LINE);
  return lines.join(MAPPINGS_LINE_SEPARATOR);
}

export function injectCssImport(): Plugin {
  return {
    name: 'cujuju:inject-css-import',
    apply: 'build',
    // Post: vite:css-post emits the extracted stylesheet in its own generateBundle.
    enforce: 'post',
    generateBundle(options, bundle) {
      const stylesheets: Rollup.OutputAsset[] = [];
      const entries: Rollup.OutputChunk[] = [];
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset') {
          if (CSS_FILE.test(file.fileName)) stylesheets.push(file);
        } else if (file.isEntry) {
          entries.push(file);
        }
      }
      if (stylesheets.length === 0) return;
      // Lib mode forces one entry and cssCodeSplit:false. chunk.viteMetadata.importedCss
      // is empty here, so nothing else could attribute a sheet to a chunk.
      if (entries.length !== 1 || stylesheets.length !== 1) {
        this.error(
          `inject-css-import assumes one entry chunk and one CSS asset; got ${entries.length} entr` +
            `${entries.length === 1 ? 'y' : 'ies'} and ${stylesheets.length} stylesheets`,
        );
      }
      const chunk = entries[0];
      const css = stylesheets[0];

      // Where the entry's own source puts its stylesheet relative to its other imports:
      // glass-menu wants the glass dependency first, context-menu wants its own sheet first.
      const entryInfo = chunk.facadeModuleId ? this.getModuleInfo(chunk.facadeModuleId) : null;
      if (!entryInfo) {
        this.error(`inject-css-import cannot read the import order of entry chunk ${chunk.fileName}`);
      }
      const importedIds = entryInfo.importedIds;
      // Everything before the entry's first CSS import — or, if the sheet comes from a
      // deeper module, before the first module bundled into this chunk.
      const boundary = importedIds.findIndex(
        (id) => CSS_FILE.test(id) || !this.getModuleInfo(id)?.isExternal,
      );
      const precedingIds = new Set(
        importedIds.slice(0, boundary === -1 ? importedIds.length : boundary),
      );

      const lines = chunk.code.split('\n');
      let insertAt = 0;
      for (const [index, line] of lines.entries()) {
        const specifier = OUTPUT_IMPORT_LINE.exec(line)?.[1];
        if (specifier === undefined) break;
        if (precedingIds.has(specifier)) insertAt = index + 1;
      }
      // Lib output is flat, so the asset's fileName is already the specifier the entry needs.
      lines.splice(insertAt, 0, `import './${css.fileName}';`);
      chunk.code = lines.join('\n');

      if (!options.sourcemap) return;
      if (options.sourcemap === 'inline' || options.sourcemapFileNames) {
        this.error(
          'inject-css-import can only realign a sourcemap emitted as a sibling .map asset; ' +
            'build with sourcemap: true and the default sourcemapFileNames',
        );
      }
      const map = bundle[`${chunk.fileName}.map`];
      if (!map || map.type !== 'asset') {
        this.error(`inject-css-import found no sourcemap asset for ${chunk.fileName}`);
      }
      const json = JSON.parse(String(map.source));
      json.mappings = spliceUnmappedLine(json.mappings, insertAt);
      map.source = JSON.stringify(json);
      // Later plugins read chunk.map rather than the asset; leaving it stale shifts them by a line.
      if (chunk.map) chunk.map.mappings = spliceUnmappedLine(chunk.map.mappings, insertAt);
    },
  };
}
