# eslint-plugin-machina

ESLint plugin for static analysis of [machina](https://machina-js.org) FSM configs. eslint-plugin-machina reports structural bugs like unreachable states, infinite `_onEnter` loops, and missing handlers as ESLint diagnostics, without running the machine.

The plugin is built on [machina-inspect](https://www.npmjs.com/package/machina-inspect) and supports ESLint 9 flat config only. `eslint` >= 9 is a peer dependency.

## Install

```bash
npm install --save-dev eslint-plugin-machina
# or
pnpm add -D eslint-plugin-machina
```

`machina-inspect` is pulled in automatically as a dependency. For TypeScript files, you also need `@typescript-eslint/parser`:

```bash
npm install --save-dev @typescript-eslint/parser
```

## Setup

### Recommended preset

```js
// eslint.config.mjs
import machina from "eslint-plugin-machina";

export default [
    machina.configs.recommended,
    // ... your other configs
];
```

### With TypeScript

```js
// eslint.config.mjs
import tsParser from "@typescript-eslint/parser";
import machina from "eslint-plugin-machina";

export default [
    {
        files: ["src/**/*.ts"],
        languageOptions: { parser: tsParser },
    },
    machina.configs.recommended,
];
```

### Manual configuration

```js
// eslint.config.mjs
import machina from "eslint-plugin-machina";

export default [
    {
        plugins: { machina },
        rules: {
            "machina/unreachable-state": "warn",
            "machina/onenter-loop": "error",
            "machina/missing-handler": "off",
        },
    },
];
```

## Rules

| Rule                        | Default   | Type       | Description                                            |
| --------------------------- | --------- | ---------- | ------------------------------------------------------ |
| `machina/unreachable-state` | `"warn"`  | problem    | States with no inbound path from `initialState`        |
| `machina/onenter-loop`      | `"error"` | problem    | Unconditional `_onEnter` transition cycles             |
| `machina/missing-handler`   | `"off"`   | suggestion | States missing handlers for inputs other states handle |

### `machina/unreachable-state`

The rule reports states that the machine cannot enter from `initialState`. Unreachable states are dead code.

```ts
// Triggers warning on "broken"
createFsm({
    id: "traffic-light",
    initialState: "green",
    states: {
        green: { timeout: "yellow" },
        yellow: { timeout: "red" },
        red: { timeout: "green" },
        broken: {}, // no transitions lead here
    },
});
```

### `machina/onenter-loop`

The rule reports unconditional `_onEnter` transition cycles, which loop forever at runtime. It flags only cycles in which each edge is unconditional. A conditional bounce like `if (ctx.error) { return "failed"; }` is an intentional pattern, and the rule skips it.

```ts
// Triggers error: unconditional cycle a -> b -> a
createFsm({
    id: "bouncy",
    initialState: "a",
    states: {
        a: { _onEnter: () => "b" },
        b: { _onEnter: () => "a" },
    },
});
```

### `machina/missing-handler`

The rule reports states that don't handle inputs handled by other states in the same FSM. It is off by default, because many FSMs have asymmetric handlers by design (terminal states, initialization states). A state with a `*` catch-all handler is exempt.

```ts
// Triggers suggestion: "idle" doesn't handle "stop" or "pause"
createFsm({
    id: "player",
    initialState: "idle",
    states: {
        idle: { start: "running" },
        running: { stop: "idle", pause: "paused" },
        paused: { resume: "running", stop: "idle" },
    },
});
```

## How it works

The plugin listens for `createFsm()` and `createBehavioralFsm()` call expressions, builds a `StateGraph` from the AST using machina-inspect's graph IR, then runs the same structural checks machina-inspect provides. The plugin reports findings as ESLint diagnostics at the call site.

### `_child` resolution

The plugin resolves a `_child` reference when it is:

- **An inline call**: `_child: createFsm({ ... })` directly in the state config
- **A `const` reference**: `_child: myChildFsm` where `myChildFsm` is a `const` declaration bound to a `createFsm()` / `createBehavioralFsm()` call in the same module

The plugin silently skips cross-module imports and `let`/`var` bindings. A skipped child goes unanalyzed, which avoids false positives from guessing.

## See Also

- [machina-inspect](https://www.npmjs.com/package/machina-inspect), the programmatic API for the same structural checks
- [machina-test](https://www.npmjs.com/package/machina-test), Jest and Vitest matchers that make graph-level assertions in your test suite
- [machina-explorer](https://machina-js.org/examples/machina-explorer/), a browser-based paste-and-analyze UI

## License

MIT
