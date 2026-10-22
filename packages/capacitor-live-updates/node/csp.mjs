/** Whether every Content-Security-Policy `<meta>` in `html` lets the page fetch `url` (connect-src). */
export function cspAllows(html, url) {
  const { host, pathname } = new URL(url);
  const target = pathname.toLowerCase();
  const attr = (tag, name) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
  };
  const policies = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => attr(tag, 'http-equiv')?.trim().toLowerCase() === 'content-security-policy')
    .map((tag) => attr(tag, 'content') ?? '');
  const allows = (source) => {
    const s = source.toLowerCase();
    if (s === '*' || s === 'https:') return true;
    const m = /^(?:https:\/\/)?([^/]+)(\/.*)?$/.exec(s);
    if (!m || m[1] !== host) return false;
    const p = m[2] ?? '/';
    return p.endsWith('/') ? target.startsWith(p) : target === p;
  };
  return policies.every((policy) => {
    const directives = new Map();
    for (const part of policy.split(';')) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources);
    }
    const sources = directives.get('connect-src') ?? directives.get('default-src');
    return !sources || sources.some(allows);
  });
}
