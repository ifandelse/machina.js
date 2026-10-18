# Testing with machina-test

Usage examples for [machina-test](https://www.npmjs.com/package/machina-test): graph matchers for Jest and Vitest, plus `walkAll` for property-based testing at runtime.

## What This Demonstrates

- **`toHaveNoUnreachableStates()`**: assert that each state is reachable from `initialState`
- **`toAlwaysReach(target, { from })`**: assert that a path exists between two states
- **`toNeverReach(target, { from })`**: assert that a target is unreachable from a starting state
- **`.not` variants**: standard Jest negation for all three matchers
- **Invalid state names**: a typo produces a normal test failure whose message lists the available states
- **Hierarchical FSM testing**: parent and child FSMs tested independently
- **`walkAll(factory, config)`**: property-based runtime testing with randomized inputs
- **Payload generators**: supply realistic payloads for specific input names
- **Seed replay**: reproduce a failing walk's input sequence from its seed

## The Key Pattern: Hierarchical FSMs

`toAlwaysReach` and `toNeverReach` operate on the top-level graph only, and they do not traverse into `_child` FSMs.

To test a child FSM's internal reachability, pass the child instance directly to `expect()`:

```ts
import "machina-test";
import { createPaymentFsm, createCheckoutFlow } from "./checkout-flow";

// Test the parent: browsing, checkout, confirmation
const payment = createPaymentFsm();
const checkout = createCheckoutFlow(payment);
expect(checkout).toAlwaysReach("confirmation", { from: "browsing" });

// Test the child: entering-details, processing, authorized, declined
expect(payment).toAlwaysReach("authorized", { from: "entering-details" });
expect(payment).toNeverReach("entering-details", { from: "authorized" });
```

`toHaveNoUnreachableStates()` is the exception: it recurses into children. The matcher delegates to machina-inspect's `inspectGraph()`, which walks the full graph tree, and an orphaned state in a child fails the assertion on the parent.

```ts
// This single assertion validates both parent AND child graphs
expect(checkout).toHaveNoUnreachableStates();
```

### The reasoning for top-level-only matchers

Consider a parent with state `"checkout"` and a child with state `"processing"`. The assertion `toAlwaysReach("processing", { from: "browsing" })` would have two readings. "Does the parent's graph contain a path to `processing`?" has the answer no, since the parent lacks that state. "Can `browsing` eventually lead to the child's `processing`?" is a composite-state question rather than a graph-topology question.

Top-level-only matchers make the answer unambiguous: you ask about the states in the graph you passed to `expect()`.

## Runtime Testing with walkAll

The matchers check graph topology: does a path exist? `walkAll` checks runtime behavior: does the FSM behave correctly when you feed it random inputs?

```ts
import { walkAll, WalkFailureError } from "machina-test";
import { createAccountTransfer } from "./account-transfer";

// Run 200 walks of 20 random inputs each. After every transition,
// the invariant checks that the balance never went negative.
const result = walkAll(() => createAccountTransfer(1000), {
    walks: 200,
    maxSteps: 20,
    seed: 42,
    invariant({ ctx }) {
        const { balance } = ctx as { balance: number };
        if (balance < 0) {
            throw new Error(`balance went negative: ${balance}`);
        }
    },
});
// result.seed: pass back to walkAll to replay this run's input choices
```

Supply payload generators to give specific inputs realistic payloads:

```ts
walkAll(() => createAccountTransfer(500), {
    walks: 300,
    maxSteps: 30,
    seed: 7,
    inputs: {
        begin: () => Math.floor(Math.random() * 200),
    },
    invariant({ ctx }) {
        /* ... */
    },
});
```

The seed drives walkAll's choice of inputs. It does not seed your payload generators, so the `Math.random()` generator above produces different payloads on each run. That trade-off suits an invariant that must hold for any payload. When a test depends on replaying one exact walk, use deterministic generators, and `src/account-transfer.test.ts` shows that pattern next to this one.

On failure, `WalkFailureError` contains the seed and the full input sequence. Passing the seed back replays the same sequence of input choices, and the walk is identical when the payload generators are deterministic. The captured `inputSequence` records the payloads from the failed run either way:

```ts
try {
    walkAll(factory, config);
} catch (err) {
    if (err instanceof WalkFailureError) {
        // err.seed, err.step, err.inputSequence, err.state
        // Re-run with { seed: err.seed } to reproduce
    }
}
```

## State Diagrams

### Order Workflow (flat FSM)

```
placed → validating → processing → shipped → delivered → refunded
                  ↘                ↘
                 cancelled       cancelled
```

Terminal states: `cancelled` and `refunded` (they have outbound transitions to nowhere).

### Checkout Flow (hierarchical FSM)

**Parent:**

```
browsing → checkout → confirmation
              ↕              ↓
           browsing       browsing
```

**Child (payment, inside checkout):**

```
entering-details → processing → authorized
                         ↓
                      declined → entering-details (retry)
```

### Account Transfer (FSM with handler logic)

```
idle → validating → transferring → completed → idle (reset)
               ↓                               ↑
             failed ─────────────────────────── (reset)
```

`validating._onEnter` checks `balance >= transferAmount` and bounces to `failed` when the transfer would overdraw. Graph matchers cannot see this conditional logic, and `walkAll` exercises it.

## Running

```bash
# From monorepo root
pnpm --filter @machina-examples/testing-with-machina-test test

# From this directory
pnpm test
```

## Files

| File                           | Purpose                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `src/order-workflow.ts`        | Flat FSM: order processing with branching paths and terminal states           |
| `src/order-workflow.test.ts`   | All three matchers, `.not` variants, invalid state names                      |
| `src/checkout-flow.ts`         | Hierarchical FSM: checkout parent with payment child                          |
| `src/checkout-flow.test.ts`    | Testing parent and child independently, `toHaveNoUnreachableStates` recursion |
| `src/account-transfer.ts`      | FSM with handler logic: conditional transitions, context mutations            |
| `src/account-transfer.test.ts` | `walkAll` examples: minimal, payload generators, seed replay                  |

## Going Deeper

- [machina-test README](https://www.npmjs.com/package/machina-test) for the full matcher and `walkAll` reference
- [machina-test docs](https://machina-js.org/tools/machina-test/) for configuration, payload generators, and BehavioralFsm client factories
- [Hierarchical FSM guide](https://machina-js.org/guide/hierarchical/) for `_child`, bubbling, and `compositeState()`
