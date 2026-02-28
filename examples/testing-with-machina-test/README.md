# Testing with machina-test

Usage examples for `machina-test` — Jest/Vitest custom matchers for FSM graph assertions and `walkAll` for property-based runtime testing.

## What This Demonstrates

- **`toHaveNoUnreachableStates()`** — assert every state is reachable from `initialState`
- **`toAlwaysReach(target, { from })`** — assert a path exists between two states
- **`toNeverReach(target, { from })`** — assert no path exists between two states
- **`.not` variants** — standard Jest negation for all three matchers
- **Invalid state name handling** — typos produce clean test failures, not thrown exceptions
- **Hierarchical FSM testing** — testing parent and child FSMs independently
- **`walkAll(factory, config)`** — property-based runtime testing with randomized inputs
- **Payload generators** — supply meaningful payloads for specific input names
- **Seed replay** — reproduce a failing walk deterministically

## The Key Pattern: Hierarchical FSMs

`toAlwaysReach` and `toNeverReach` operate on the **top-level graph only**. They do not traverse into `_child` FSMs. This is intentional.

To test a child FSM's internal reachability, pass the child instance directly to `expect()`:

```ts
import "machina-test";
import { createPaymentFsm, createCheckoutFlow } from "./checkout-flow";

// Test the PARENT — only sees browsing, checkout, confirmation
const payment = createPaymentFsm();
const checkout = createCheckoutFlow(payment);
expect(checkout).toAlwaysReach("confirmation", { from: "browsing" });

// Test the CHILD — only sees entering-details, processing, authorized, declined
expect(payment).toAlwaysReach("authorized", { from: "entering-details" });
expect(payment).toNeverReach("entering-details", { from: "authorized" });
```

**The one exception**: `toHaveNoUnreachableStates()` _does_ recurse into children. It delegates to `machina-inspect`'s `inspectGraph()`, which walks the full graph tree. An orphaned state in a child will surface as a failure on the parent.

```ts
// This single assertion validates both parent AND child graphs
expect(checkout).toHaveNoUnreachableStates();
```

### Why not traverse into children automatically?

Consider a parent with state `"checkout"` and a child with state `"processing"`. What would `toAlwaysReach("processing", { from: "browsing" })` mean?

- "Can the parent reach `processing`?" — No, it doesn't have that state.
- "Can `browsing` eventually lead to the child's `processing`?" — That's a composite-state question, not a graph-topology question.

By keeping reachability matchers top-level-only, the answer is always unambiguous: you're asking about the states in the graph you passed to `expect()`.

## Runtime Testing with walkAll

The matchers above check **graph topology** — does a path exist? `walkAll` checks **runtime behavior** — does the FSM actually behave correctly when you feed it random inputs?

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
// result.seed — pass back to walkAll to replay this exact run
```

Supply payload generators so inputs carry meaningful data:

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

On failure, `WalkFailureError` carries the seed and full input sequence. Pass the seed back to replay the exact walk:

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

Terminal states: `cancelled`, `refunded` (no outbound transitions).

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

`validating._onEnter` checks `balance >= transferAmount` — bounces to `failed` if the transfer would overdraw. This conditional logic is invisible to graph matchers but exercised by `walkAll`.

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
| `src/order-workflow.ts`        | Flat FSM — order processing with branching paths and terminal states          |
| `src/order-workflow.test.ts`   | All three matchers, `.not` variants, invalid state names                      |
| `src/checkout-flow.ts`         | Hierarchical FSM — checkout parent with payment child                         |
| `src/checkout-flow.test.ts`    | Testing parent and child independently, `toHaveNoUnreachableStates` recursion |
| `src/account-transfer.ts`      | FSM with handler logic — conditional transitions, context mutations           |
| `src/account-transfer.test.ts` | `walkAll` examples — minimal, payload generators, seed replay                 |
