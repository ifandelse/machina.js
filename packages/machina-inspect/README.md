# machina-inspect

Static analysis for [machina](https://machina-js.org) FSM configs. machina-inspect finds structural bugs like unreachable states, infinite `_onEnter` loops, and missing handlers, without running the FSM.

This library parses your FSM config (or a live instance) into a directed graph (an intermediate representation, or IR), then runs checks against it. The graph is a first-class export, so other tools (diagram generators, linters, [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina)) can build on the same representation.

machina-inspect is the right entry point for scripts and custom tooling. For the same checks inline in your editor, use [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina), and for test assertions, use [machina-test](https://www.npmjs.com/package/machina-test). Both build on this package.

## Install

```bash
npm install machina-inspect
# or
pnpm add machina-inspect
```

`machina` >= 7.0.1 is a peer dependency.

## Quick Start

```ts
import { inspect } from "machina-inspect";

const config = {
    id: "traffic-light",
    initialState: "green",
    states: {
        green: { timeout: "yellow" },
        yellow: { timeout: "red" },
        red: { timeout: "green" },
        broken: {}, // unreachable: no transitions lead here
    },
};

const findings = inspect(config);
// [
//     {
//         type: "unreachable-state",
//         states: ["broken"],
//         message: 'State "broken" is unreachable from initialState "green" in FSM "traffic-light".',
//         ...
//     },
//     { type: "missing-handler", states: ["broken"], inputs: ["timeout"], ... },
// ]
```

`inspect()` accepts live instances too:

```ts
import { createFsm } from "machina";

const fsm = createFsm({
    id: "toggle",
    initialState: "on",
    context: {},
    states: {
        on: { flip: "off" },
        off: { flip: "on" },
    },
});

const findings = inspect(fsm); // []
```

## What It Checks

machina-inspect rates each transition edge it discovers as `"definite"` (always taken) or `"possible"` (conditional). The checks below use those ratings, and [Confidence Levels](#confidence-levels) defines them fully.

### Unreachable States

The unreachable check reports each state that the machine cannot enter from `initialState`. Both `"definite"` and `"possible"` edges count, because any path at all makes a state reachable. The search is a breadth-first traversal from `initialState`.

### `_onEnter` Loops

The loop check reports cycles of `_onEnter` transitions in which each edge is `"definite"`, the loops that bounce unconditionally at runtime. A conditional bounce like `if (ctx.error) { return "failed"; }` is an intentional pattern, and the check skips it. Same-state self-loops are also skipped, because the machina runtime ignores same-state transitions. The detection is a depth-first cycle search over the `_onEnter` subgraph.

### Missing Handlers

The missing-handler check collects the input names that appear anywhere in the FSM, then reports the states that leave some of those inputs unhandled. The check is best-effort: only inputs visible as graph edges (string shorthand or statically extractable function returns) enter the set.

A state with a `*` catch-all is exempt, since the catch-all handles any input. `_onEnter`, `_onExit`, and `*` are excluded from the input set, and child graphs are checked against their own input sets.

## Findings

Findings are a discriminated union. Narrow on `finding.type` to access the type-specific fields.

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

## API

### `inspect(input): Finding[]`

Builds a state graph and runs all checks. Returns an array of findings, and an empty array means the config passed.

`input` is either a config object (`{ id, initialState, states }`) or a live `Fsm` / `BehavioralFsm` instance.

### `buildStateGraph(input): StateGraph`

Builds the graph IR without running the checks. Use it when you want the graph for other purposes (visualization, custom analysis) and want to avoid building it twice.

### `inspectGraph(graph): Finding[]`

Runs all checks against a pre-built `StateGraph`. Pair it with `buildStateGraph()` when you need both the graph and the findings.

```ts
import { buildStateGraph, inspectGraph } from "machina-inspect";

const graph = buildStateGraph(config);
// use `graph` for diagram export, etc.
const findings = inspectGraph(graph);
```

## For Tool Authors

The exports below serve tools built on machina-inspect, like the ESLint plugin and diagram generators.

### Graph IR

Downstream tools consume the `StateGraph` directly:

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

The graph builder follows `_child` declarations recursively, and each child graph appears in `children`, keyed by the parent state name. A child graph is analyzed independently, with its own `initialState` and its own reachability.

### Confidence Levels

- **`"definite"`**: an unconditional transition. String shorthands (`timeout: "yellow"`) and functions with one top-level return.
- **`"possible"`**: a conditional transition. Returns inside `if`, `switch`, ternary, logical expressions, or `try` blocks, and any function with multiple return statements.

machina-inspect parses `handler.toString()` with [acorn](https://github.com/acornjs/acorn) to find transition targets in function handlers. Non-string returns, template literals, and variable returns are ignored. The analysis is best-effort.

### `analyzeHandler(handler): HandlerTarget[]`

Parses a handler function for transition targets via acorn AST analysis of `handler.toString()`. Returns `{ target, confidence }` pairs.

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

Walks a pre-parsed ESTree/acorn function AST node to extract transition targets. This is the shared core behind the runtime path (`analyzeHandler`) and the ESLint plugin. It accepts `AstFunctionNode`, a union of `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression`.

```ts
import { walkHandlerAst } from "machina-inspect";
import type { AstFunctionNode } from "machina-inspect";

// Use with a pre-parsed AST node (e.g., from ESLint or acorn)
const targets = walkHandlerAst(functionNode as AstFunctionNode);
```

## See Also

- [machina-explorer](https://machina-js.org/examples/machina-explorer/), a browser-based paste-and-analyze UI built on machina-inspect

## License

MIT
