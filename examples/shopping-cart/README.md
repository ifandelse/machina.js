# Shopping Cart

This example demonstrates the `defer()` mechanism in machina using a shopping cart workflow where users can fire actions faster than the system can process them. The FSM definition is in [src/fsm.ts](./src/fsm.ts), and the [defer guide](https://machina-js.org/guide/defer/) covers the API in depth.

## What this demonstrates

### `defer({ until: "state" })`, the targeted form

When a handler calls `defer({ until: "someState" })`, machina queues the current input and replays it once the FSM enters that state, which saves the caller from retrying.

```ts
// In the validating state: user clicked "Apply Coupon" while validation is running
applyCoupon({ defer }) {
    defer({ until: "browsing" });  // queue it; replay when we're back in browsing
},
```

The deferred input replays in FIFO order. Multiple deferred inputs of the same type stack up and replay in the order they were received.

### `defer()`, the untargeted form

Calling `defer()` with no argument queues the input to replay on the **next state transition**, regardless of what state that is. The FSM parks everything and lets the landing state sort it out.

The `error` state in this example uses this pattern via a catch-all handler:

```ts
error: {
    "*"({ defer }) {
        defer();  // park everything; replay after retry or reset transitions us out
    },
    retry: "browsing",
}
```

The `error` state is not wired into the demo UI but is reachable via `fsm.transition("error")` from the browser console.

### Deferring across several transitions

The `recordPurchaseAnalytics` input illustrates a real-world deferred workflow: you can fire it at any point during browsing, validating, or applying a discount, and it stays queued across state transitions until the FSM reaches `checkout` and replays it.

## Cart states

| State                | What happens                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `browsing`           | Idle. Accepts `addItem`, `applyCoupon`, `checkout` (if items > 0).                            |
| `validating`         | Async inventory/price check (~2s). `applyCoupon` and `checkout` defer to `browsing`.          |
| `applyingDiscount`   | Async discount calculation (~1.8s). `addItem`, `applyCoupon`, `checkout` defer to `browsing`. |
| `reservingInventory` | Intent chokepoint (~1.5s). Unhandled inputs emit `nohandler` and drop.                        |
| `checkout`           | Review page. `recordPurchaseAnalytics` executes here (deferred inputs replay).                |
| `confirmed`          | Terminal state. Only `reset` works.                                                           |
| `error`              | Not in normal flow. Demonstrates untargeted `defer()` via catch-all `"*"` handler.            |

## Defer matrix

| Input                     | browsing            | validating          | applyingDiscount    | reservingInventory | checkout  |
| ------------------------- | ------------------- | ------------------- | ------------------- | ------------------ | --------- |
| `addItem`                 | execute             | n/a                 | defer to `browsing` | nohandler          | execute   |
| `applyCoupon`             | execute             | defer to `browsing` | defer to `browsing` | nohandler          | execute   |
| `checkout`                | execute\*           | defer to `browsing` | defer to `browsing` | nohandler          | nohandler |
| `recordPurchaseAnalytics` | defer to `checkout` | defer to `checkout` | defer to `checkout` | nohandler          | execute   |

\*checkout is blocked by an `itemCount === 0` guard.

## Key machina concepts

- **`defer({ until: "state" })`**: queue an input to replay when the FSM enters that state
- **`defer()`**: queue an input to replay on the next transition to any state
- **`_onEnter` / `_onExit`**: lifecycle hooks used to start and clear async timers
- **`emit()`**: custom events the FSM fires so the orchestrator can react without coupling FSM logic to UI code
- **FSM-driven async**: the FSM transitions into a "working" state, `_onEnter` starts the timer, and the timer callback calls `handle()` on the same instance to drive completion

## Running the demo

From this directory:

```
pnpm dev
```

From the monorepo root:

```
pnpm --filter @machina-examples/shopping-cart dev
```

## Running tests

```
pnpm test
```

Tests use Jest fake timers to control async operation durations deterministically. They cover each defer scenario and the timer start and clear lifecycle. They also cover resets from each state and FIFO replay ordering, plus the untargeted defer pattern in the error state.
