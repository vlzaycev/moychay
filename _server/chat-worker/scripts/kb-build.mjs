// Knowledge base → SQL for D1. Sources (Markdown with a small front matter: id, title, source):
//   _content/assistant/site/*.md       generated from the website by _build/build.py (do not edit)
//   _content/assistant/knowledge/*.md  hand-written facts, FAQ, new documents – edit and add freely
// Run `npm run kb:push` after changing them: the Worker picks the new knowledge up within 5 minutes, no deploy needed.
// Everything here is sent to the AI and may be quoted to visitors, so it must be PUBLIC: a document marked
// `visibility: internal` (or private/confidential) or containing anything that looks like a key, token or
// password stops the build – internal price lists, B2B finance and staff contacts never reach the model.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const dirs = ['_content/assistant/site', '_content/assistant/knowledge'];
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const NOT_PUBLIC = [
  /sk-(?:ant|proj|live|test)?-?[A-Za-z0-9_-]{20,}/i, /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:password|passwd|пароль|api[_ ]?key|secret[_ ]?key|bot[_ ]?token)\s*[:=]/i,
  /(?:закупочн|себестоим|purchase price|cost price|internal price)/i,
];

export function readDocs() {
  const docs = [];
  for (const d of dirs) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!m) throw new Error(`${d}/${f}: front matter (---) is missing`);
      const meta = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*/)).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(': ').trim()]));
      if (!/^[a-z0-9-]{2,60}$/.test(meta.id || '')) throw new Error(`${d}/${f}: id must be lowercase letters, digits, dashes`);
      if (/^(internal|private|confidential|staff)$/i.test(meta.visibility || '')) throw new Error(`${d}/${f}: visibility "${meta.visibility}" – only public documents go to the assistant`);
      const bad = NOT_PUBLIC.find((r) => r.test(m[2]));
      if (bad) throw new Error(`${d}/${f}: looks like a credential or internal data (${bad.source.slice(0, 30)}…) – the assistant gets public facts only`);
      docs.push({ id: meta.id, title: meta.title || meta.id, source: meta.source || `${d}/${f}`, body: m[2].trim() });
    }
  }
  const ids = docs.map((x) => x.id);
  const dupe = ids.find((x, i) => ids.indexOf(x) !== i);
  if (dupe) throw new Error(`duplicate document id: ${dupe}`);
  return docs;
}

export function toSQL(docs, now = Date.now()) {
  // full replace: documents deleted from the folders disappear from the assistant too
  return ['DELETE FROM knowledge_documents;',
    ...docs.map((x) => `INSERT INTO knowledge_documents (id, title, body, source, updated_at, active) VALUES (${q(x.id)}, ${q(x.title)}, ${q(x.body)}, ${q(x.source)}, ${now}, 1);`)].join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const docs = readDocs();
  fs.writeFileSync(path.join(here, '..', '.kb.sql'), toSQL(docs));
  const chars = docs.reduce((n, x) => n + x.body.length, 0);
  console.log(`knowledge: ${docs.length} documents, ${chars} characters (~${Math.round(chars / 4)} tokens) → .kb.sql`);
}
