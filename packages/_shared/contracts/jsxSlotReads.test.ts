import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Each read of a JSX prop builds a new tree. Read a slot once or via `children()`. Misses: a lone unowned read; slot types from other files.

const PROPS_OBJECTS = new Set(['props', 'local']);
const MAX_UNRESOLVED_READS = 1;
const JSX_SLOT_TYPES = new Set(['JSX.Element', 'JSXElement']);
// Control-flow attributes evaluate their value; any other component attribute passes the getter on unread.
const EVALUATED_ATTRIBUTES = new Set(['when', 'each']);

type TypeDecl = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

function typeDeclarations(file: ts.SourceFile): Map<string, TypeDecl> {
  const decls = new Map<string, TypeDecl>();
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) decls.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return decls;
}

/** JSX slot names of a props type; parts declared in another file contribute none. */
function slotsOfType(type: ts.Node | undefined, decls: Map<string, TypeDecl>, file: ts.SourceFile, seen = new Set<string>()): Set<string> {
  const slots = new Set<string>();
  const addMembers = (members: ts.NodeArray<ts.TypeElement>): void => {
    for (const member of members) {
      if (!ts.isPropertySignature(member) || !member.type || !ts.isIdentifier(member.name)) continue;
      const name = member.name.text;
      if (name !== 'children' && ts.isTypeReferenceNode(member.type) && JSX_SLOT_TYPES.has(member.type.typeName.getText(file))) slots.add(name);
    }
  };
  const merge = (inner: ts.Node): void => slotsOfType(inner, decls, file, seen).forEach((slot) => slots.add(slot));
  const followName = (name: string): void => {
    const decl = seen.has(name) ? undefined : decls.get(name);
    if (!decl) return;
    seen.add(name);
    if (ts.isTypeAliasDeclaration(decl)) merge(decl.type);
    else {
      addMembers(decl.members);
      decl.heritageClauses?.forEach((clause) => clause.types.forEach(merge));
    }
  };
  if (!type) return slots;
  if (ts.isTypeLiteralNode(type)) addMembers(type.members);
  else if (ts.isIntersectionTypeNode(type)) type.types.forEach(merge);
  else if (ts.isTypeReferenceNode(type)) followName(type.typeName.getText(file));
  else if (ts.isExpressionWithTypeArguments(type)) followName(type.expression.getText(file));
  return slots;
}

const isPropsMember = (node: ts.Node | undefined): boolean =>
  !!node && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && PROPS_OBJECTS.has(node.expression.text);

/** `<C c={props.slot} />` hands the getter on unread (the receiver is checked itself); `when`/`each` and inline JSX still read. */
function isPassThroughAttribute(node: ts.Node, file: ts.SourceFile): boolean {
  if (!ts.isJsxAttribute(node) || EVALUATED_ATTRIBUTES.has(node.name.getText(file))) return false;
  const element = node.parent.parent;
  const isComponent = (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)) && /^[A-Z]/.test(element.tagName.getText(file));
  const value = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
  return isComponent && isPropsMember(value);
}

/** `() => props.slot` is a factory: each caller builds its own copy. */
const isSlotFactory = (node: ts.Node): boolean => ts.isArrowFunction(node) && isPropsMember(node.body);

function propsParam(node: ts.Node): ts.ParameterDeclaration | undefined {
  if (!ts.isFunctionDeclaration(node) && !ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) return undefined;
  const first = node.parameters[0];
  return first && ts.isIdentifier(first.name) && first.name.text === 'props' ? first : undefined;
}

/** Slots read more than once outside `children(...)`, as `Component.slot ×reads`. Passing a slot on is free unless the component also reads it. */
function overReadSlots(source: string): string[] {
  const file = ts.createSourceFile('probe.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const decls = typeDeclarations(file);
  const offenders: string[] = [];
  const scan = (fn: ts.FunctionLikeDeclaration, param: ts.ParameterDeclaration): void => {
    const slots = slotsOfType(param.type, decls, file);
    const reads = new Map<string, number>();
    const passes = new Map<string, number>();
    const count = (map: Map<string, number>, member: ts.Node | undefined): void => {
      const slot = member && ts.isPropertyAccessExpression(member) ? member.name.text : undefined;
      if (slot && slots.has(slot)) map.set(slot, (map.get(slot) ?? 0) + 1);
    };
    const visit = (node: ts.Node): void => {
      const nested = propsParam(node);
      if (nested) return scan(node as ts.FunctionLikeDeclaration, nested);
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'children') return;
      if (isPassThroughAttribute(node, file)) return count(passes, ((node as ts.JsxAttribute).initializer as ts.JsxExpression).expression);
      if (isSlotFactory(node)) return count(passes, (node as ts.ArrowFunction).body);
      if (isPropsMember(node)) count(reads, node);
      ts.forEachChild(node, visit);
    };
    if (fn.body) visit(fn.body);
    const component = fn.name && ts.isIdentifier(fn.name) ? fn.name.text : '(anonymous)';
    for (const [slot, read] of reads) {
      const total = read + (passes.get(slot) ?? 0);
      if (total > MAX_UNRESOLVED_READS) offenders.push(`${component}.${slot} ×${total}`);
    }
  };
  const visitTop = (node: ts.Node): void => {
    const param = propsParam(node);
    if (param) return scan(node as ts.FunctionLikeDeclaration, param);
    ts.forEachChild(node, visitTop);
  };
  visitTop(file);
  return offenders;
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, acc);
    else if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
}

describe('the slot scanner itself', () => {
  const slotProps = 'props: { slot?: JSX.Element; label: string }';

  it('flags a slot checked and then rendered', () => {
    expect(overReadSlots(`function A(${slotProps}) { return <Show when={props.slot}>{props.slot}</Show>; }`)).toEqual(['A.slot ×2']);
  });

  it('allows a slot resolved with children(), a single read, and non-slot props', () => {
    expect(overReadSlots(`function A(${slotProps}) { const s = children(() => props.slot); return [s(), s(), props.label, props.label]; }`)).toEqual([]);
    expect(overReadSlots(`function A(${slotProps}) { return props.slot; }`)).toEqual([]);
  });

  it('resolves interfaces, aliases, heritage and intersections', () => {
    const source = 'interface Base { slot?: JSXElement }\ninterface Mid extends Base { x: string }\ntype P = Mid & { y: string };\n' +
      'function A(props: P) { return [props.slot, props.slot]; }';
    expect(overReadSlots(source)).toEqual(['A.slot ×2']);
  });

  it('skips component pass-throughs and factories, but counts control-flow conditions', () => {
    expect(overReadSlots(`function A(${slotProps}) { return [<B c={props.slot} />, <C c={props.slot} />, { f: () => props.slot }]; }`)).toEqual([]);
    expect(overReadSlots(`function A(${slotProps}) { return <Show when={props.slot}><B c={props.slot} /></Show>; }`)).toEqual(['A.slot ×2']);
    expect(overReadSlots(`function A(${slotProps}) { return <Show when={props.slot}><div>{props.slot}</div></Show>; }`)).toEqual(['A.slot ×2']);
    expect(overReadSlots(`function A(${slotProps}) { return <B c={<Show when={props.slot}>{props.slot}</Show>} />; }`)).toEqual(['A.slot ×2']);
  });

  it("takes slots from each component's own props, and sees splitProps locals", () => {
    expect(overReadSlots('function A(props: { label: JSX.Element }) { return props.label; }\n' +
      'function B(props: { label: string }) { return [props.label, props.label]; }')).toEqual([]);
    expect(overReadSlots("function A(props: { slot?: JSX.Element }) { const [local] = splitProps(props, ['slot']); return [local.slot, local.slot]; }"))
      .toEqual(['A.slot ×2']);
  });
});

describe('JSX slot contract', () => {
  it('no component reads a JSX slot prop more than once without children()', () => {
    const packageDir = process.env.PACKAGE_DIR;
    expect(packageDir, 'libTest sets PACKAGE_DIR').toBeTruthy();
    const srcDir = join(packageDir!, 'src');
    const files = existsSync(srcDir) ? collectSourceFiles(srcDir) : [];
    const offenders = files.flatMap((file) =>
      overReadSlots(readFileSync(file, 'utf8')).map((hit) => `${relative(packageDir!, file).split(sep).join('/')}: ${hit}`));
    expect(offenders, `Resolve the slot once with \`children(() => props.slot)\`. Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });
});
