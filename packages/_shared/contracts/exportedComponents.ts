/** A component export: PascalCase, unlike hooks (`createX`) and constants (`SCREAMING_CASE`). */
const COMPONENT_NAME = /^[A-Z](?=\w*[a-z])/;

/** Component exports of an entry file: `export { A, B as C, type T }` and `export function|const X`. */
export function exportedComponents(entry: string): string[] {
  const names: string[] = [];
  for (const [, list] of entry.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of list.replace(/\/\/.*$/gm, '').split(',')) {
      const spec = raw.trim();
      if (!spec || spec.startsWith('type ')) continue;
      names.push(spec.split(/\s+as\s+/).at(-1)!);
    }
  }
  for (const [, name] of entry.matchAll(/export\s+(?:function|const)\s+(\w+)/g)) names.push(name);
  return names.filter((name) => COMPONENT_NAME.test(name));
}
