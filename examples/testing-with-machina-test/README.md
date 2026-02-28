# Testing with machina-test

Usage examples for `machina-test` — Jest/Vitest custom matchers for asserting FSM graph topology.

## What This Demonstrates

- **`toHaveNoUnreachableStates()`** — assert every state is reachable from `initialState`
- **`toAlwaysReach(target, { from })`** — assert a path exists between two states
- **`toNeverReach(target, { from })`** — assert no path exists between two states
- **`.not` variants** — standard Jest negation for all three matchers
- **Invalid state name handling** — typos produce clean test failures, not thrown exceptions
- **Hierarchical FSM testing** — testing parent and child FSMs independently

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

## Running

```bash
# From monorepo root
pnpm --filter @machina-examples/testing-with-machina-test test

# From this directory
pnpm test
```

## Files

| File                         | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `src/order-workflow.ts`      | Flat FSM — order processing with branching paths and terminal states          |
| `src/order-workflow.test.ts` | All three matchers, `.not` variants, invalid state names                      |
| `src/checkout-flow.ts`       | Hierarchical FSM — checkout parent with payment child                         |
| `src/checkout-flow.test.ts`  | Testing parent and child independently, `toHaveNoUnreachableStates` recursion |
