# eslint-plugin-machina

ESLint plugin for static analysis of [machina](https://machina-js.org) FSM configs. Catches structural issues at lint time — unreachable states, infinite `_onEnter` loops, missing handlers — without running the machine.

Built on [machina-inspect](https://www.npmjs.com/package/machina-inspect). ESLint 9 flat config only.

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

Detects states with no inbound path from `initialState`. Unreachable states are dead code.

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

Detects unconditional `_onEnter` transition cycles that will infinite-loop the runtime. Only flags cycles where **every** edge is unconditional — conditional bounces like `if (ctx.error) return "failed"` are intentional patterns, not bugs.

```ts
// Triggers error — unconditional cycle: a -> b -> a
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

Detects states that don't handle inputs handled by other states in the same FSM. Off by default — many FSMs have asymmetric handlers by design (terminal states, initialization states, etc.). States with a `*` catch-all handler are excluded.

```ts
// Triggers suggestion — "idle" doesn't handle "stop" or "pause"
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

The plugin listens for `createFsm()` and `createBehavioralFsm()` call expressions, builds a `StateGraph` from the AST using machina-inspect's graph IR, then runs the same structural checks machina-inspect provides. Findings are reported as ESLint diagnostics at the call site.

### `_child` resolution

Child FSM references on `_child` are resolved when they're:

- **Inline calls**: `_child: createFsm({ ... })` directly in the state config
- **`const` references**: `_child: myChildFsm` where `myChildFsm` is a `const` declaration bound to a `createFsm()` / `createBehavioralFsm()` call in the same module

Cross-module imports and `let`/`var` bindings are silently skipped — no false positives, just no analysis for those cases.

## See also

- [machina-inspect](https://www.npmjs.com/package/machina-inspect) — programmatic API for the same structural checks
- [machina-test](https://www.npmjs.com/package/machina-test) — Jest/Vitest custom matchers for graph-level assertions in your test suite
- [machina-explorer](https://machina-js.org/examples/machina-explorer/) — browser-based paste-and-analyze UI

## License

MIT
