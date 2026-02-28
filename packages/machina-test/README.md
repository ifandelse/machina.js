# machina-test

Jest/Vitest custom matchers for testing [machina](https://machina-js.org) FSM topology. Assert reachability, catch dead states, and verify structural invariants — all from your existing test suite.

```ts
import "machina-test";

expect(fsm).toHaveNoUnreachableStates();
expect(fsm).toAlwaysReach("delivered", { from: "placed" });
expect(fsm).toNeverReach("shipped", { from: "cancelled" });
```

Built on [machina-inspect](https://www.npmjs.com/package/machina-inspect). Zero ceremony beyond the import.

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

## See also

- [machina-inspect](https://www.npmjs.com/package/machina-inspect) — the graph analysis engine these matchers are built on
- [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina) — catch structural issues at lint time in your editor
- [testing-with-machina-test example](../../examples/testing-with-machina-test/) — full working example with flat and hierarchical FSMs

## License

MIT
