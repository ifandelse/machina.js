# machina-inspect

Static analysis for [machina](https://machina-js.org) FSM configs. Catches structural bugs — unreachable states, infinite `_onEnter` loops, missing handlers — without running the machine.

Parses your FSM config (or a live instance) into a directed graph IR, then runs checks against it. The graph is a first-class export, so other tools (diagram generators, linters, [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina)) can build on the same representation.

## Install

```bash
npm install machina-inspect
# or
pnpm add machina-inspect
```

`machina` >= 6.0.0 is a peer dependency.

## Quick Start

```ts
import { createFsm } from "machina";
import { inspect } from "machina-inspect";

const config = {
    id: "traffic-light",
    initialState: "green",
    states: {
        green: { timeout: "yellow" },
        yellow: { timeout: "red" },
        red: { timeout: "green" },
        broken: {}, // unreachable — no transitions lead here
    },
};

const findings = inspect(config);
// [{ type: "unreachable-state", states: ["broken"], ... }]
```

Works with live instances too:

```ts
const fsm = createFsm(config);
const findings = inspect(fsm);
```

## API

### `inspect(input): Finding[]`

Build a state graph and run all checks. Returns an array of findings — empty means no issues.

`input` is either a config object (`{ id, initialState, states }`) or a live `Fsm` / `BehavioralFsm` instance.

### `buildStateGraph(input): StateGraph`

Build the graph IR without running checks. Use this when you want the graph for other purposes (visualization, custom analysis) and want to avoid building it twice.

### `inspectGraph(graph): Finding[]`

Run all checks against a pre-built `StateGraph`. Pair with `buildStateGraph()` when you need both the graph and the findings.

```ts
import { buildStateGraph, inspectGraph } from "machina-inspect";

const graph = buildStateGraph(config);
// use `graph` for diagram export, etc.
const findings = inspectGraph(graph);
```

### `analyzeHandler(handler): HandlerTarget[]`

Parse a handler function for transition targets via acorn AST analysis of `handler.toString()`. Returns `{ target, confidence }` pairs.

```ts
import { analyzeHandler } from "machina-inspect";

const targets = analyzeHandler(({ ctx }) => {
    if (ctx.ready) {
        return "active";
    }
});
// [{ target: "active", confidence: "possible" }]
```

### `walkHandlerAst(node): HandlerTarget[]`

Walk a pre-parsed ESTree/acorn function AST node to extract transition targets. This is the shared core used by both the runtime path (`analyzeHandler`) and the ESLint plugin. Accepts `AstFunctionNode` — a union of `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression`.

```ts
import { walkHandlerAst } from "machina-inspect";
import type { AstFunctionNode } from "machina-inspect";

// Use with a pre-parsed AST node (e.g., from ESLint or acorn)
const targets = walkHandlerAst(functionNode as AstFunctionNode);
```

## Checks

### Unreachable States

BFS from `initialState`. Any state with no inbound path is reported. Both `"definite"` and `"possible"` edges count — if there's any path, the state is reachable.

### `_onEnter` Loops

DFS cycle detection on the subgraph of `_onEnter` transitions. Only reports cycles where **every** edge is `"definite"` (unconditional). Conditional bounces like `if (ctx.error) return "failed"` are intentional patterns, not bugs.

Same-state self-loops are excluded — the machina runtime ignores same-state transitions, so they're no-ops.

### Missing Handlers

Collects the union of all input names across all states in the FSM. States that don't handle inputs present elsewhere are flagged. This is a best-effort check — only inputs visible as graph edges (string shorthand or statically extractable function returns) are included.

States with a `*` catch-all handler are excluded (they implicitly handle everything). `_onEnter`, `_onExit`, and `*` are excluded from the input union. Child graphs are checked independently with their own input sets.

## Graph IR

The `StateGraph` is designed to be consumed by downstream tools:

```ts
interface StateGraph {
    fsmId: string;
    initialState: string;
    nodes: Record<string, StateNode>;
    children: Record<string, StateGraph>; // child FSMs, keyed by parent state
}

interface StateNode {
    name: string;
    edges: TransitionEdge[];
}

interface TransitionEdge {
    inputName: string; // handler name, "_onEnter", or "*"
    from: string;
    to: string;
    confidence: "definite" | "possible";
}
```

### Confidence Levels

- **`"definite"`** — Unconditional transition. String shorthands (`timeout: "yellow"`) and functions with a single top-level return.
- **`"possible"`** — Conditional transition. Returns inside `if`, `switch`, ternary, logical expressions, or `try` blocks. Also applies when a function has multiple return statements.

Function handlers are analyzed via [acorn](https://github.com/acornjs/acorn) (AST parsing of `handler.toString()`). Non-string returns, template literals, and variable returns are ignored — the analysis is best-effort, not exhaustive.

## Child FSMs

`_child` declarations are followed recursively. The resulting child graphs appear in `StateGraph.children`, keyed by the parent state name. Each child graph is analyzed independently (its own `initialState`, its own reachability).

## Findings

Findings are a discriminated union — narrow on `finding.type` to access type-specific fields.

```ts
interface BaseFinding {
    message: string;
    fsmId: string;
    states: string[];
    parentState?: string; // set for child FSM findings
}

interface UnreachableFinding extends BaseFinding {
    type: "unreachable-state";
}

interface OnEnterLoopFinding extends BaseFinding {
    type: "onenter-loop";
}

interface MissingHandlerFinding extends BaseFinding {
    type: "missing-handler";
    inputs: string[]; // the input names this state is missing
}

type Finding = UnreachableFinding | OnEnterLoopFinding | MissingHandlerFinding;
```

## See also

- [machina-test](https://www.npmjs.com/package/machina-test) — Jest/Vitest custom matchers built on machina-inspect's graph analysis
- [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina) — get these checks inline in your editor via ESLint
- [machina-explorer](https://machina-js.org/examples/machina-explorer/) — browser-based paste-and-analyze UI built on machina-inspect

## License

MIT
