/**
 * Test: findMermaidErrors detects broken mermaid and extractMermaidSources works.
 * Runs in Node.js using mermaid's CLI-compatible API.
 */
import { JSDOM } from 'jsdom';

// Mermaid needs browser globals (DOMPurify, document, etc.)
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, writable: true });
globalThis.self = dom.window;

const { default: mermaid } = await import('mermaid');

mermaid.initialize({ startOnLoad: false });

// --- extractMermaidSources (duplicated from MarkdownRenderer for standalone test) ---
function extractMermaidSources(md) {
  const sources = [];
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    sources.push(m[1].replace(/\n$/, ''));
  }
  return sources;
}

// --- findMermaidErrors (mirrors App.tsx logic) ---
async function findMermaidErrors(summary) {
  const fields = [
    summary.tldr, summary.summary, summary.factCheck,
    summary.conclusion,
    ...(summary.extraSections?.map(s => s.content) || []),
  ].filter(Boolean);

  const errors = [];
  for (const field of fields) {
    for (const source of extractMermaidSources(field)) {
      try {
        await mermaid.parse(source);
      } catch (err) {
        errors.push({ source, error: err.message || String(err) });
      }
    }
  }
  return errors;
}

// --- Test cases ---
const tests = [
  {
    name: 'valid flowchart - no errors',
    summary: {
      tldr: '', summary: '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```', conclusion: '',
      keyTakeaways: [], notableQuotes: [], relatedTopics: [], tags: [],
    },
    expectErrors: 0,
  },
  {
    name: 'unclosed bracket - should error',
    summary: {
      tldr: '', summary: '```mermaid\ngraph TD\n    A[Start] --> B[End\n```', conclusion: '',
      keyTakeaways: [], notableQuotes: [], relatedTopics: [], tags: [],
    },
    expectErrors: 1,
  },
  {
    name: 'multiple diagrams, one broken',
    summary: {
      tldr: '',
      summary: '```mermaid\ngraph TD\n    A --> B\n```\nSome text\n```mermaid\ngraph TD\n    C[Start --> D\n```',
      conclusion: '',
      keyTakeaways: [], notableQuotes: [], relatedTopics: [], tags: [],
    },
    expectErrors: 1,
  },
  {
    name: 'broken diagram in extraSections',
    summary: {
      tldr: '', summary: 'No diagrams here', conclusion: '',
      keyTakeaways: [], notableQuotes: [], relatedTopics: [], tags: [],
      extraSections: [
        { title: 'Architecture', content: '```mermaid\ngraph TD\n    A( --> B\n```' },
      ],
    },
    expectErrors: 1,
  },
  {
    name: 'no mermaid blocks at all',
    summary: {
      tldr: 'Just text', summary: 'Plain summary', conclusion: 'Done',
      keyTakeaways: [], notableQuotes: [], relatedTopics: [], tags: [],
    },
    expectErrors: 0,
  },
  {
    name: 'extractMermaidSources: plain code block (no mermaid tag)',
    summary: {
      tldr: '', summary: '```\ngraph TD\n    A --> B\n```', conclusion: '',
      keyTakeaways: [], notableQuotes: [], relatedTopics: [], tags: [],
    },
    expectErrors: 0, // should NOT be detected — it's not a mermaid block
  },
];

// --- Run ---
let passed = 0;
let failed = 0;

for (const t of tests) {
  const errors = await findMermaidErrors(t.summary);
  const ok = errors.length === t.expectErrors;
  if (ok) {
    passed++;
    console.log(`  PASS  ${t.name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${t.name} — expected ${t.expectErrors} errors, got ${errors.length}`);
    for (const e of errors) {
      console.log(`        Error: ${e.error.substring(0, 100)}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
