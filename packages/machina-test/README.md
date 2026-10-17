# machina-test

Testing tools for [machina](https://machina-js.org) FSMs: graph matchers for the wiring, and property-based testing at runtime with `walkAll`.

```ts
import "machina-test";
import { walkAll } from "machina-test";

// Graph matchers: does the wiring look right?
expect(fsm).toHaveNoUnreachableStates();
expect(fsm).toAlwaysReach("delivered", { from: "placed" });
expect(fsm).toNeverReach("shipped", { from: "cancelled" });

// Runtime testing: does it work when it runs?
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

`machina` >= 8.0.0 is a peer dependency, and the host test runner must be `jest` >= 29 or `vitest` >= 1.

## Setup

Import `machina-test` in your test files, or in a setup file that runs after the framework's globals are available. The import registers the matchers via `expect.extend()` as a side effect.

```ts
// in each test file
import "machina-test";

// or in jest.setup.ts / vitest.setup.ts
import "machina-test";
```

TypeScript users get autocomplete for all three matchers automatically.

## Matchers

### `toHaveNoUnreachableStates()`

Asserts that each state in the FSM is reachable from `initialState`. The matcher delegates to machina-inspect's `inspectGraph()`, which recurses into child FSM graphs.

```ts
expect(fsm).toHaveNoUnreachableStates();
```

### `toAlwaysReach(targetState, { from })`

Asserts that a path exists from `from` to `targetState` in the FSM's top-level graph. The search is a BFS over all edges, both `"definite"` and `"possible"`.

```ts
expect(fsm).toAlwaysReach("delivered", { from: "placed" });
```

"Always" is a claim about the graph: the path exists in the wiring. Whether the path executes at runtime depends on which handlers fire.

### `toNeverReach(targetState, { from })`

Asserts that `targetState` is unreachable from `from`. It is the logical inverse of `toAlwaysReach`.

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

A typo in a state name produces a normal test failure, and the message lists the available states:

```
State 'shiped' does not exist in FSM 'order-workflow'. Available states: placed, validating, processing, shipped, delivered, cancelled, refunded.
```

### Hierarchical FSMs

`toAlwaysReach` and `toNeverReach` operate on the top-level graph only, and they do not traverse into `_child` FSMs. The limit is intentional: it avoids ambiguity around composite state names, and each assertion states which level it tests.

To test a child FSM, pass it directly to `expect()`:

```ts
// Test the parent: browsing, checkout, confirmation
expect(checkout).toAlwaysReach("confirmation", { from: "browsing" });

// Test the child: entering-details, processing, authorized, declined
const payment = createPaymentFsm();
expect(payment).toAlwaysReach("authorized", { from: "entering-details" });
expect(payment).toNeverReach("entering-details", { from: "authorized" });
```

`toHaveNoUnreachableStates()` is the exception: it recurses into children via `inspectGraph()`. An orphaned state in a child fails the assertion on the parent.

## Runtime Testing with `walkAll`

The matchers check graph topology: does a path exist? `walkAll` checks runtime behavior: does the FSM work when you feed it random inputs?

```ts
import { walkAll, WalkFailureError } from "machina-test";

const result = walkAll(
    () => createMyFsm(), // factory: fresh FSM per walk
    {
        walks: 200, // 200 independent walks
        maxSteps: 20, // up to 20 handle() calls per walk
        seed: 42, // deterministic: same sequence every run
        inputs: {
            begin: () => 100, // payload for handle("begin", 100)
        },
        invariant({ ctx }) {
            // runs after each transition, throw to fail
            if ((ctx as any).balance < 0) {
                throw new Error("balance went negative");
            }
        },
    }
);
```

`inputs` maps an input name to a payload generator. When a walk fires `begin`, walkAll calls `inputs.begin()` and passes the return value to `handle()`. For an input without a generator, walkAll calls `handle()` with the input name alone.

The seed drives walkAll's choice of inputs. It does not seed your payload generators, so a generator that calls `Math.random()` breaks replay. When you rely on replay, use deterministic generators or give them their own seeded source.

On success, `walkAll` returns a `WalkResult` with the `seed` it used and `walksCompleted`, the number of walks that finished without an invariant violation.

On failure, `WalkFailureError` contains the `seed`, `step`, `state`, and `inputSequence` fields. Pass the seed back to replay the exact walk that failed:

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

If the factory returns an FSM built with an [input payload map](https://machina-js.org/guide/typed-payloads/), the config requires a `payloads` key in place of `inputs`. You supply one tuple-returning generator per payload-carrying input, and the compiler checks the set. A missing or misspelled generator is a compile error, with the input's name in the message.

Both `Fsm` and `BehavioralFsm` are supported. See the [docs](https://machina-js.org/tools/machina-test/) for the full configuration reference, payload generators (untyped and typed), input filtering, and BehavioralFsm client factories.

## See Also

- [machina-inspect](https://www.npmjs.com/package/machina-inspect), the graph analysis engine behind the matchers
- [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina), the same structural checks at lint time in your editor
- [testing-with-machina-test](https://github.com/ifandelse/machina.js/tree/master/examples/testing-with-machina-test), a working example with matchers and walkAll

## License

MIT
