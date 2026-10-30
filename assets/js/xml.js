// Küçük, bağımlılıksız XML ayrıştırıcı. Excel (.xlsx), OpenDocument (.ods), Excel 2003 XML ve
// e-Fatura (UBL-TR) gibi iyi biçimlendirilmiş belgeler için yeterlidir; tarayıcıda ve Node'da aynı çalışır.
// Düğüm: { name: 'cbc:IssueDate', local: 'IssueDate', attrs: {...}, children: [...], text: '...' }

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const localName = name => name.slice(name.indexOf(':') + 1);

export function parseXml(src) {
  const root = { name: '#document', local: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const textEnd = lt === -1 ? n : lt;
    if (textEnd > i) {
      const t = src.slice(i, textEnd);
      if (t.trim()) stack[stack.length - 1].text += decodeEntities(t);
      else if (stack.length > 1) stack[stack.length - 1].text += t; // hücre içi boşluklar korunur
    }
    if (lt === -1) break;
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; if (i < 3) break; continue; }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      stack[stack.length - 1].text += src.slice(lt + 9, end === -1 ? n : end);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') { i = src.indexOf('>', lt) + 1; if (i === 0) break; continue; }
    const gt = findTagEnd(src, lt);
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;
    if (raw[0] === '/') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const m = /^([^\s/>]+)/.exec(body);
    if (!m) continue;
    const node = { name: m[1], local: localName(m[1]), attrs: {}, children: [], text: '' };
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = attrRe.exec(body.slice(m[1].length)))) node.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

// Tırnak içindeki ">" karakterlerini atlayarak etiketin sonunu bulur.
function findTagEnd(src, start) {
  let q = null;
  for (let j = start + 1; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '>') return j;
  }
  return src.length;
}

// Yardımcılar: ad alanı önekinden bağımsız olarak yerel ada göre arar.
export function children(node, local) {
  return node.children.filter(c => c.local === local);
}
export function child(node, local) {
  return node.children.find(c => c.local === local) || null;
}
export function findAll(node, local, out = []) {
  for (const c of node.children) {
    if (c.local === local) out.push(c);
    findAll(c, local, out);
  }
  return out;
}
export function find(node, local) {
  for (const c of node.children) {
    if (c.local === local) return c;
    const r = find(c, local);
    if (r) return r;
  }
  return null;
}
export function textOf(node) {
  if (!node) return '';
  return node.text + node.children.map(textOf).join('');
}
export function attr(node, local) {
  if (!node) return undefined;
  for (const [k, v] of Object.entries(node.attrs)) if (localName(k) === local) return v;
  return undefined;
}
export function rootElement(doc) {
  return doc.children.find(c => !c.name.startsWith('#')) || null;
}
