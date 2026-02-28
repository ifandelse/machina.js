# machina-test

Testing tools for [machina](https://machina-js.org) FSMs — graph topology matchers and property-based runtime testing.

```ts
import "machina-test";
import { walkAll } from "machina-test";

// Graph matchers — does the wiring look right?
expect(fsm).toHaveNoUnreachableStates();
expect(fsm).toAlwaysReach("delivered", { from: "placed" });
expect(fsm).toNeverReach("shipped", { from: "cancelled" });

// Runtime testing — does it actually work?
walkAll(() => createMyFsm(), {
    invariant({ ctx }) {
        /* assert a rule that must always hold */
    },
});
```

Graph matchers are built on [machina-inspect](https://www.npmjs.com/package/machina-inspect). `walkAll` runs the FSM live with randomized inputs.

## Install

```bash
npm install --save-dev machina-test
# or
pnpm add -D machina-test
```

`machina` >= 6.1.0 is a peer dependency. Either `jest` or `vitest` must be available as the host test runner.

## Setup

Import `machina-test` in your test files (or in a setup file that runs after the framework's globals are available). The import registers the matchers via `expect.extend()` as a side effect.

```ts
// in each test file
import "machina-test";

// or in jest.setup.ts / vitest.setup.ts
import "machina-test";
```

That's it. TypeScript users get autocomplete for all three matchers automatically.

## Matchers

### `toHaveNoUnreachableStates()`

Asserts that every state in the FSM is reachable from `initialState`. Delegates to machina-inspect's `inspectGraph()`, which recurses into child FSM graphs.

```ts
expect(fsm).toHaveNoUnreachableStates();
```

### `toAlwaysReach(targetState, { from })`

Asserts that a path exists from `from` to `targetState` in the FSM's top-level graph. BFS over all edges (both "definite" and "possible"). Top-level graph only — does not traverse into `_child` FSMs.

```ts
expect(fsm).toAlwaysReach("delivered", { from: "placed" });
```

"Always" refers to graph topology — the plumbing exists — not runtime certainty. Whether the path executes at runtime depends on which handlers fire.

### `toNeverReach(targetState, { from })`

Asserts that no path exists from `from` to `targetState`. The logical inverse of `toAlwaysReach`.

```ts
expect(fsm).toNeverReach("shipped", { from: "cancelled" });
```

### `.not` variants

Standard Jest/Vitest negation works as expected:

```ts
expect(fsm).not.toAlwaysReach("shipped", { from: "cancelled" });
expect(fsm).not.toNeverReach("delivered", { from: "placed" });
```

### Invalid state names

Typos produce clean test failures (not thrown exceptions) with actionable messages:

```
State 'shiped' does not exist in FSM 'order-workflow'. Available states: placed, validating, processing, shipped, delivered, cancelled, refunded.
```

## Testing hierarchical FSMs

`toAlwaysReach` and `toNeverReach` operate on the **top-level graph only**. They do not traverse into `_child` FSMs. This is intentional — it avoids ambiguity around composite state names and keeps assertions explicit about which level you're testing.

To test a child FSM, pass it directly to `expect()`:

```ts
// Test the parent — sees browsing, checkout, confirmation
expect(checkout).toAlwaysReach("confirmation", { from: "browsing" });

// Test the child — sees entering-details, processing, authorized, declined
const payment = createPaymentFsm();
expect(payment).toAlwaysReach("authorized", { from: "entering-details" });
expect(payment).toNeverReach("entering-details", { from: "authorized" });
```

**The one exception**: `toHaveNoUnreachableStates()` _does_ recurse into children via `inspectGraph()`. An orphaned state in a child surfaces as a failure when called on the parent.

## walkAll — Runtime Testing

The matchers check graph topology — does a path exist? `walkAll` checks runtime behavior — does the FSM actually work when you feed it random inputs?

```ts
import { walkAll, WalkFailureError } from "machina-test";

const result = walkAll(
    () => createMyFsm(), // factory: fresh FSM per walk
    {
        walks: 200, // 200 independent walks
        maxSteps: 20, // up to 20 handle() calls per walk
        seed: 42, // deterministic — same sequence every run
        inputs: {
            begin: () => Math.floor(Math.random() * 200),
        },
        invariant({ ctx }) {
            // checked after every transition — throw to fail
            if ((ctx as any).balance < 0) {
                throw new Error("balance went negative");
            }
        },
    }
);
```

On failure, `WalkFailureError` carries the seed, step number, and full input sequence. Pass the seed back to replay the exact walk that failed:

```ts
try {
    walkAll(factory, config);
} catch (err) {
    if (err instanceof WalkFailureError) {
        // err.seed, err.step, err.state, err.inputSequence
        // Replay: walkAll(factory, { ...config, seed: err.seed })
    }
}
```

Both `Fsm` and `BehavioralFsm` are supported. See the [docs](https://machina-js.org/tools/machina-test/) for full configuration reference, payload generators, input filtering, and BehavioralFsm client factories.

## See also

- [machina-inspect](https://www.npmjs.com/package/machina-inspect) — the graph analysis engine the matchers are built on
- [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina) — catch structural issues at lint time in your editor
- [testing-with-machina-test example](../../examples/testing-with-machina-test/) — full working example with matchers and walkAll

## License

MIT
