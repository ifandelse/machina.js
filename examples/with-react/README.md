# with-react

A multi-step checkout flow built with machina and React 19. The FSM contains the flow logic, and the [machina-react](https://www.npmjs.com/package/machina-react) hooks do the subscription work. Read the code and take what applies to your situation.

machina is framework-agnostic. The FSM in `src/fsm.ts` imports only machina, and the full React integration is 49 lines in `src/hooks/useCheckout.tsx`.

## What It Demonstrates

The core pattern puts FSM logic in one file (`src/fsm.ts`) and React wiring in another (`src/hooks/useCheckout.tsx`). UI components call `handle()` and read `state` and `context`, and they never import from `fsm.ts` directly.

machina concepts shown:

- `createFsm` with a typed context object that the FSM and the React layer share by reference
- `_onEnter` lifecycle hooks for side effects, like the async payment simulation and flag clearing
- Payload arguments through `handle("next", formData)`, where components own ephemeral form state and submit it on transition
- `canHandle()` for computing each button's disabled state
- `dispose()` under a pending timer, exercised in the tests

machina-react integration:

- `CheckoutProvider` stores the FSM in ordinary React context, the provider pattern from the machina-react README.
- The provider creates the FSM once in a ref, which avoids the StrictMode double-invoke problem around disposal.
- `useCheckout()` wraps `useFsm(fsm)` and returns `{ state, context, handle, canHandle }` to components.
- `useCheckoutSelector()` wraps `useFsmSelector` for components that need a derived slice.

## The Checkout Flow

The flow has eight states covering one happy path plus several error and editing branches:

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

The payment step includes a scenario picker (success / failure / 3D Secure) for exercising each branch without real payment infrastructure.

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

`src/fsm.ts` is plain TypeScript, and the FSM tests run under Jest like any module's tests:

```sh
pnpm test
```

The suite covers the eight states, both `returnTo` round-trips, the 3DS loop-prevention flag, the `startOver` context reset, `canHandle` per state, factory isolation across two instances, disposal under a pending timer, and the `paymentProcessing` timer behavior with fake timers.

## Key Files

| File                        | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `src/fsm.ts`                | The FSM definition. It imports only machina.                                        |
| `src/hooks/useCheckout.tsx` | `CheckoutProvider`, `useCheckout`, and `useCheckoutSelector`, the integration layer |
| `src/App.tsx`               | Top-level state switch that renders the step component for the current `state`      |
| `src/types.ts`              | Shared types and constants (`CheckoutContext`, `CheckoutState`, `STATE_TO_STEP`)    |
| `src/components/`           | One component per FSM state. Each calls `useCheckout()` and renders the snapshot    |
| `src/fsm.test.ts`           | FSM unit tests (Jest, fake timers)                                                  |

## Design Notes

**Context is shared by reference**: `createCheckoutFsm()` returns `{ fsm, context }`, and the FSM mutates that one object on each `handle()` call. The machina-react snapshot exposes the same live reference, and components read current values whenever a settled snapshot triggers a render. Keeping context out of React state means the FSM file imports only machina.

**There is no `useEffect` cleanup for the FSM**: React StrictMode simulates unmount and remount for effects without re-running the component body. A cleanup that disposed the FSM would leave the remounted tree subscribed to a dead instance before the ref could recreate it. Disposal is unnecessary here: the FSM's state is in-memory only, and garbage collection reclaims it when the provider unmounts. The one dangling reference is a `setTimeout` in `paymentProcessing`, which fires harmlessly after unmount.

**`startOver` resets context fields in place**: the hook layer and the components read one shared object. Replacing it with a fresh object would break the shared reference, and components would still read the old one. Resetting the fields in place preserves the reference.

## Going Deeper

- [createFsm guide](https://machina-js.org/guide/fsm/) for the FSM API this example builds on
- [machina-react](https://www.npmjs.com/package/machina-react) for the hooks (`useFsm`, `useFsmSelector`, render triggers)
- [Lifecycle events guide](https://machina-js.org/guide/events/) for the subscription model under the hooks
