# machina-explorer

A browser-based tool that runs the [machina-inspect](https://www.npmjs.com/package/machina-inspect) checks on a pasted [machina](https://machina-js.org) FSM config and draws its state graph as a mermaid diagram. A hosted copy runs at [machina-js.org/demos/machina-explorer](https://machina-js.org/demos/machina-explorer/).

## The Pipeline

- You paste an FSM config object into a CodeMirror editor and click Analyze.
- The evaluator wraps the pasted text in `new Function()` and runs it in your browser tab. The code never leaves the page.
- `buildStateGraph()` turns the config into machina-inspect's graph IR, and `inspectGraph()` runs the structural checks against it.
- The findings tab lists each check result: unreachable states, `_onEnter` loops, and missing handlers.
- The diagram tab renders the graph with [mermaid](https://mermaid.js.org/). A `"possible"` (conditional) transition is marked with `(?)`, and a toggle adds handler notes.
- Export buttons copy the mermaid source or download the diagram as an SVG.

⚠️ **Paste only code you trust.** The evaluator runs the pasted text as arbitrary JavaScript with the page's origin privileges.

## What It Demonstrates

The example shows machina-inspect used as a library rather than through the ESLint plugin or test matchers:

- `buildStateGraph()` and `inspectGraph()` paired: the findings report and the diagram use one graph build
- The `StateGraph` IR consumed by a custom renderer (`src/mermaid-generator.ts` walks nodes, edges, and child graphs)
- Edge `confidence` levels surfaced in a UI

## Running

From this directory:

```sh
pnpm dev
```

From the monorepo root:

```sh
pnpm --filter @machina-examples/machina-explorer dev
```

Vite serves the app, and `pnpm test` runs the evaluator and mermaid-generator unit tests.

## Key Files

| File                       | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `src/main.ts`              | Entry point wiring the editor, evaluator, checks, report, and diagram |
| `src/evaluator.ts`         | Evaluates the pasted config text and checks the result's structure    |
| `src/mermaid-generator.ts` | Converts a `StateGraph` into mermaid stateDiagram source              |
| `src/report.ts`            | Renders findings, errors, and the clean-result message                |
| `src/diagram.ts`           | Renders the mermaid source into the page                              |
| `src/export.ts`            | Copy-mermaid-source and download-SVG actions                          |
| `src/editor.ts`            | CodeMirror setup                                                      |

## Going Deeper

- [machina-inspect README](https://www.npmjs.com/package/machina-inspect) for the checks, the graph IR, and the tool-author API
- [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina) for the same checks inline in your editor
