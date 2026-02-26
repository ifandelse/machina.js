# machina-inspect

Static analysis for [machina](https://machina-js.org) FSM configs. Catches structural bugs — unreachable states, infinite `_onEnter` loops — without running the machine.

Parses your FSM config (or a live instance) into a directed graph IR, then runs checks against it. The graph is a first-class export, so other tools (diagram generators, linters) can build on the same representation.

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

### `inspectGraph(graph): StateGraph`

Run all checks against a pre-built `StateGraph`. Pair with `buildStateGraph()` when you need both the graph and the findings.

```ts
import { buildStateGraph, inspectGraph } from "machina-inspect";

const graph = buildStateGraph(config);
// use `graph` for diagram export, etc.
const findings = inspectGraph(graph);
```

## Checks

### Unreachable States

BFS from `initialState`. Any state with no inbound path is reported. Both `"definite"` and `"possible"` edges count — if there's any path, the state is reachable.

### `_onEnter` Loops

DFS cycle detection on the subgraph of `_onEnter` transitions. Only reports cycles where **every** edge is `"definite"` (unconditional). Conditional bounces like `if (ctx.error) return "failed"` are intentional patterns, not bugs.

Same-state self-loops are excluded — the machina runtime ignores same-state transitions, so they're no-ops.

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

```ts
interface Finding {
    type: "unreachable-state" | "onenter-loop";
    message: string;
    fsmId: string;
    states: string[]; // affected state(s)
    parentState?: string; // set for child FSM findings
}
```

## License

MIT
