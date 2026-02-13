/** Per-diagram-type documentation files, imported as raw strings. */
const docFiles = import.meta.glob('./mermaid-docs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Essential mermaid syntax rules — always included in LLM prompts. */
export const MERMAID_ESSENTIAL_RULES = `## MERMAID SYNTAX RULES
- Every diagram starts with a **type declaration** (e.g. \`flowchart LR\`, \`sequenceDiagram\`)
- The word \`end\` in lowercase breaks parsers — use \`"end"\`, \`(end)\`, \`[end]\`, or \`End\`
- Wrap special characters in \`"double quotes"\` or use HTML entities (\`#amp;\` \`#lt;\` \`#gt;\` \`#35;\`)
- Line breaks in labels: use \`<br>\` or \`<br/>\`
- Do NOT use escaped quotes (\\") inside node labels — use \`<br>\` for line breaks, \`<b>\`/\`<i>\` for formatting
- Node IDs must be ONLY letters or digits (A, B, C1, node1) — NO colons, dashes, dots, spaces, or special characters in IDs
- ALL display text goes inside brackets: A["Label with special:chars"], B{"Decision?"}
- Edge labels use |label| syntax. Always use \`flowchart TD\` or \`flowchart LR\`, never \`graph\`
- All diagrams MUST use \`\`\`mermaid fenced code blocks
- Do NOT nest matching delimiters in labels — \`A(foo(bar))\` and \`A[a[b]]\` break. Use quotes: \`A["foo(bar)"]\`
- Use \`stateDiagram-v2\` (not \`stateDiagram\`) — v1 is deprecated and has different syntax
- Frontmatter \`---\` must be the absolute first line — no whitespace, comments, or blank lines above it

## COMMON PITFALLS
1. **\`end\` keyword** — Never use lowercase \`end\` as node text. Wrap: \`"end"\`, \`End\`, \`[end]\`
2. **Leading \`o\` or \`x\`** in flowchart nodes — \`A---oB\` creates circle edge, not node "oB"
3. **Missing colons** in ER diagrams — all three parts required: \`ENTITY1 ||--o{ ENTITY2 : "label"\`
4. **Quotes around spaces** — Node names with spaces need \`"double quotes"\` in ER diagrams
5. **\`{}\` in comments** — Avoid curly braces inside \`%%\` comments; they confuse the parser
6. **Semicolons** in sequence diagram messages — Use \`#59;\` to escape
7. **Tab indentation** in mindmaps — Use spaces only
8. **Escaped quotes in JSON** — When diagram is inside a JSON string, \`\\"\` becomes \`"\` which breaks node labels like \`["text"]\`. Use \`<b>text</b>\` or parentheses \`(text)\` instead
9. **Subgraph direction ignored** — When nodes inside a subgraph link to nodes outside it, the subgraph \`direction\` is silently overridden by the parent
10. **Pie values must be positive** — Zero or negative values cause silent errors
11. **Duplicate node IDs with different shapes** — \`A[rect]\` then \`A(round)\` causes unpredictable rendering. Define shape once, reference by ID after
12. **xychart-beta data arrays are numbers only** — \`[10, 20, 30]\` NOT \`["10", "20", "30"]\` or \`[China:25, US:15]\`. No strings, no key:value pairs — just plain numbers
13. **xychart-beta series name goes before the array** — \`bar "UK" [50, 5, 1]\` NOT \`bar ["UK", "50", "5"]\`. Categories go in x-axis, not in bar/line arrays
14. **Horizontal xychart axis swap** — For \`xychart-beta horizontal\`, just add \`horizontal\` — do NOT swap axis definitions. x-axis still holds categories, y-axis still holds the value label
15. **ER cardinality in class diagrams** — \`{\`, \`}\`, \`|\` cardinality markers (e.g. \`||--o{\`, \`}|--||\`, \`*--o{\`) are erDiagram-only and will break class diagrams. Class diagrams use: \`<|--\`, \`*--\`, \`o--\`, \`-->\`, \`..>\`, \`..|>\` with optional quoted multiplicity: \`A "1" *-- "*" B\`
16. **Percent sign in labels** — \`%\` breaks the parser (conflicts with \`%%\` comment syntax). Use "pct" or spell out "percent" instead
17. **Class annotations in other diagrams** — \`<<interface>>\`, \`<<abstract>>\`, \`<<test>>\` are classDiagram-only. Do NOT use \`<<...>>\` in requirementDiagram, erDiagram, or other types
18. **quadrantChart data points** — Must be numeric \`Name: [x, y]\` with x,y between 0 and 1 (e.g. \`Task A: [0.3, 0.7]\`). NOT categorical labels. Requires \`x-axis\`, \`y-axis\`, and \`quadrant-1..4\` definitions
19. **sankey-beta is CSV only** — Uses \`source,target,value\` rows (e.g. \`Fossil,Asia,17.5\`). No \`-->\` arrows, no \`[labels]\`, no \`title\`. NOT flowchart syntax
20. **\`title\` is not universal** — Only supported in: xychart-beta, pie, gantt, quadrantChart, journey, timeline. Do NOT add \`title\` to flowchart, sequenceDiagram, classDiagram, erDiagram, block-beta, sankey-beta, architecture-beta, kanban, or treemap-beta
21. **C4 boundaries vs elements** — Only \`Boundary\`, \`Enterprise_Boundary\`, \`System_Boundary\`, \`Container_Boundary\` can have \`{ }\` children. There is NO \`Component_Boundary\`. \`Container()\`, \`Component()\`, \`System()\` are leaf elements — do NOT add \`{ }\` to them
22. **Flowchart syntax in other diagrams** — \`A[label] --> B[label]\` is flowchart-only. architecture-beta needs \`service\`/\`group\` keywords with icons and directional edges (\`T/B/L/R\`). block-beta needs \`columns\` grid layout. sankey-beta needs CSV rows. Each diagram type has its own syntax
23. **\`Note over\` max 2 participants** — In sequenceDiagram, \`Note over A,B:\` works but \`Note over A,B,C:\` will fail with a parse error. Use separate notes or \`rect\` to span 3+ participants

## AVAILABLE DIAGRAM TYPES
| Diagram Type | Use For |
|-------------|---------|
| \`flowchart\` | Process flows, algorithms, decision trees |
| \`sequenceDiagram\` | API calls, protocols, message exchanges between actors |
| \`classDiagram\` | OOP class structure, interfaces, inheritance |
| \`stateDiagram-v2\` | State machines, lifecycles, transitions |
| \`erDiagram\` | Database schemas, entity relationships |
| \`requirementDiagram\` | Requirements tracing, verification |
| \`gantt\` | Project schedules, task timelines with dependencies |
| \`pie\` | Distribution / proportions as slices |
| \`mindmap\` | Brainstorming, topic hierarchies |
| \`timeline\` | Historical events, chronological milestones |
| \`gitGraph\` | Git branch strategies, merge flows |
| \`journey\` | UX user flows with satisfaction scores |
| \`quadrantChart\` | 2D comparison (effort vs impact, priority matrices) |
| \`xychart-beta\` | Stacked bar charts (vertical/horizontal), line charts, or combined bar+line |
| \`sankey-beta\` | Flow/energy diagrams, resource distribution |
| \`block-beta\` | Block/grid diagrams, system layouts |
| \`kanban\` | Kanban boards, workflow columns with tasks |
| \`architecture-beta\` | Cloud/infra architecture, service topology |
| \`treemap-beta\` | Hierarchical proportions, nested area charts |
| \`C4Context\` / \`C4Container\` / \`C4Component\` / \`C4Deployment\` | C4 architecture model at different zoom levels |

## MERMAID COLORS & LEGENDS
- Do NOT add YAML frontmatter with config/theme/themeVariables — colors are applied automatically.
- Do NOT add emoji legend lines (🟦 🟧 etc.) below diagrams — legends are generated automatically.
- For flowchart node styling, classDef in diagram body is still allowed.`;

/**
 * Map from mermaid diagram keyword → raw doc content.
 * Built from individual files in mermaid-docs/.
 */
export const mermaidDocSections: Record<string, string> = /* @__PURE__ */ (() => {
  // Map from filename (without extension) → mermaid source keywords
  const fileToKeywords: Record<string, string[]> = {
    flowchart: ['flowchart', 'graph'],
    sequenceDiagram: ['sequenceDiagram'],
    classDiagram: ['classDiagram'],
    stateDiagram: ['stateDiagram', 'stateDiagram-v2'],
    entityRelationshipDiagram: ['erDiagram'],
    gantt: ['gantt'],
    pie: ['pie'],
    mindmap: ['mindmap'],
    timeline: ['timeline'],
    gitgraph: ['gitGraph'],
    userJourney: ['journey'],
    quadrantChart: ['quadrantChart'],
    xyChart: ['xychart-beta'],
    sankey: ['sankey-beta'],
    block: ['block-beta'],
    kanban: ['kanban'],
    architecture: ['architecture-beta'],
    treemap: ['treemap-beta'],
    c4: ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'],
    requirementDiagram: ['requirementDiagram'],
  };

  const sections: Record<string, string> = {};
  for (const [path, content] of Object.entries(docFiles)) {
    // path looks like "./mermaid-docs/flowchart.md"
    const filename = path.split('/').pop()?.replace('.md', '') ?? '';
    const keywords = fileToKeywords[filename];
    if (keywords) {
      for (const kw of keywords) sections[kw] = content;
    }
  }
  return sections;
})();

/** All mermaid doc files keyed by filename (without extension). */
export const mermaidDocFiles: Record<string, string> = /* @__PURE__ */ (() => {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(docFiles)) {
    const filename = path.split('/').pop()?.replace('.md', '') ?? '';
    files[filename] = content;
  }
  return files;
})();

/**
 * Annotate mermaid errors inline: for each broken ```mermaid...``` block in `fieldText`,
 * append an HTML comment with the error message right after the closing ```.
 */
export function annotateMermaidErrors(
  fieldText: string,
  errors: Array<{ source: string; error: string }>,
): string {
  let result = fieldText;
  for (const { source, error } of errors) {
    // Match the exact mermaid block containing this source
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('```mermaid\\n' + escaped + '\\n```');
    result = result.replace(re, (match) => `${match}\n<!-- MERMAID ERROR: ${error} -->`);
  }
  return result;
}

/**
 * Get recovery documentation for broken diagrams: relevant cheatsheets.
 */
export function getRecoveryDocs(errors: Array<{ source: string; error: string }>): string {
  return getRelevantCheatsheet(errors.map(e => e.source));
}

/**
 * Get relevant documentation for the given broken diagram sources.
 * Deduplicates when multiple diagrams use the same type.
 */
export function getRelevantCheatsheet(sources: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const src of sources) {
    // First non-empty, non-comment line gives the diagram type keyword
    const firstLine = src.split('\n').find(l => l.trim() && !l.trim().startsWith('%%'));
    if (!firstLine) continue;
    const keyword = firstLine.trim().split(/[\s{]/)[0];
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    const section = mermaidDocSections[keyword];
    if (section) parts.push(section);
  }
  return parts.length > 0
    ? '\n\nRelevant Mermaid syntax reference:\n\n' + parts.join('\n\n---\n\n')
    : '';
}
