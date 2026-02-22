# with-react

A multi-step checkout flow built with machina.js v6 and React 19. The example demonstrates one way to integrate a machina FSM into a React application — not the only way, and deliberately not a library or abstraction. Read the code and take what applies to your situation.

machina is framework-agnostic. Nothing in `fsm.ts` touches React. The integration layer is roughly 40 lines in `hooks/useCheckout.tsx`.

## What It Demonstrates

**The core pattern:** FSM logic lives in one file (`fsm.ts`), React wiring lives in another (`hooks/useCheckout.tsx`), and UI components only ever call `handle()` and read `state` and `context`. No component imports from `fsm.ts` directly.

**Specific machina concepts shown:**

- `createFsm` with a typed context object shared by reference between the FSM and the React layer
- `_onEnter` lifecycle hooks for side effects (async payment simulation, flag clearing)
- Passing extra arguments through `handle("next", formData)` — components own ephemeral form state and submit it on transition
- `canHandle()` for driving button disabled state without catching silent no-ops
- `fsm.on("transitioned", ...)` as the change notification mechanism

**React-specific integration choices:**

- `useSyncExternalStore` bridges the FSM's event API to React's render cycle. The subscribe function listens for `transitioned` events; the snapshot is the current state name string (a primitive, so no spurious re-renders).
- The context object is held by reference, not copied. The FSM mutates it; components read it. Re-renders happen on state transitions, at which point the context is already updated.
- `CheckoutProvider` creates the FSM once on first render using a ref, not `useState` or `useEffect`. This avoids the StrictMode double-invoke problem with disposal.
- `useMemo` on the API object means consumers only re-render on state transitions, not on every parent re-render.

## The Checkout Flow

Eight states, one happy path, several error and editing branches:

```
start
  → personalDetails
    → payment
      → paymentProcessing (1.5s async simulation)
        → review
          → confirmation → (startOver → start)
          → personalDetails (edit, returns to review)
          → payment (edit, re-processes, returns to review)
        → paymentFailed
          → paymentProcessing (retry)
          → payment (edit card)
        → threeDSecure
          → paymentProcessing (auto-advances to review on second pass)
```

The payment step includes a scenario picker (success / failure / 3D Secure) so you can exercise all branches without real payment infrastructure.

## Running

From this directory:

```sh
pnpm dev
```

From the monorepo root:

```sh
pnpm --filter @machina-examples/with-react dev
```

Open `http://localhost:5173`.

## Testing

The FSM has no React dependencies, so it tests like any plain TypeScript module:

```sh
pnpm test
```

Tests cover all 8 states, both `returnTo` round-trips, the 3DS loop-prevention flag, `startOver` context reset, `canHandle` per state, factory isolation (two independent instances), and the `paymentProcessing` timer behavior with fake timers.

## Key Files

| File                        | Purpose                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `src/fsm.ts`                | The FSM definition. Zero React imports.                                           |
| `src/hooks/useCheckout.tsx` | `CheckoutProvider` and `useCheckout` — the full React integration layer.          |
| `src/App.tsx`               | Top-level state switch: renders the correct step component for `state`.           |
| `src/types.ts`              | Shared types and constants (`CheckoutContext`, `CheckoutState`, `STATE_TO_STEP`). |
| `src/components/`           | One component per FSM state. Each calls `useCheckout()` and nothing else.         |
| `src/fsm.test.ts`           | FSM unit tests (Jest, fake timers).                                               |

## Design Notes Worth Reading

**Why the context object is shared by reference, not synced through React state.** The FSM mutates `context` on every `handle()` call. If context were React state, you'd need to call `setState` from inside FSM handlers, which means importing React into `fsm.ts` or passing a setter as a constructor argument. Instead, `createCheckoutFsm()` returns both `{ fsm, context }` — the caller holds the same object the FSM writes to. State transitions trigger re-renders via `useSyncExternalStore`, at which point the context is already up to date.

**Why there is no `useEffect` cleanup for the FSM.** React 18 StrictMode simulates unmount/remount for effects but does not re-run the component body. If the FSM were disposed in a cleanup effect, `useSyncExternalStore` would try to re-subscribe to a disposed FSM before the lazy ref init could recreate it. The FSM holds no external resources — when the Provider truly unmounts, the refs are GC'd. The only dangling reference is a `setTimeout` in `paymentProcessing`, which resolves harmlessly against a dead FSM reference.

**Why `confirmation.startOver` mutates context in place instead of replacing it.** The hook holds a ref to the original context object. Replacing it with a fresh one would break the shared reference — components would keep reading from the old object. Mutating the fields in place is the simpler fix.
