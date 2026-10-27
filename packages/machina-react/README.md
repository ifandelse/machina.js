# machina-react

React hooks that subscribe components to [machina](https://machina-js.org) FSMs. A component reads the machine as a snapshot and rerenders when the machine changes.

machina-react does not create or manage FSM instances. The instance belongs to your app, at module scope or in ordinary React context. You pass that instance to these hooks.

The hooks are built on React's `useSyncExternalStore`, and snapshots stay consistent under concurrent rendering in React 18. The hooks are client-only. Rendering them on the server throws, because `useSyncExternalStore` requires a server snapshot that these hooks never supply.

## Install

```bash
npm install machina machina-react
# or
pnpm add machina machina-react
```

`machina` >= 8.2.0 and `react` >= 18 are peer dependencies. The floor is 8.2 because the hook types reuse the types behind core's [input payload maps](https://machina-js.org/guide/typed-payloads/) and [event maps](https://machina-js.org/guide/events/#typed-custom-events).

## Quick Start

```tsx
import { createFsm } from "machina";
import { useFsm } from "machina-react";

const checkout = createFsm({
    id: "checkout",
    initialState: "cart",
    context: { total: 0 },
    states: {
        cart: { submit: "payment" },
        payment: { back: "cart", confirm: "complete" },
        complete: {},
    },
});

const CheckoutStep = () => {
    const { state, handle, canHandle } = useFsm(checkout);

    return (
        <button disabled={!canHandle("submit")} onClick={() => handle("submit")}>
            {state}
        </button>
    );
};
```

The component rerenders when the FSM settles after an input.

## Hooks

The exports split into snapshot hooks, which rerender your component, and event hooks, which run callbacks.

| Export                                                      | What it does                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `useFsm(fsm, options?)`                                     | Snapshot hook. Subscribes a component to an `Fsm` and rerenders it on change |
| `useBehavioralFsm(fsm, client, options?)`                   | Snapshot hook. Subscribes to one client of a `BehavioralFsm`                 |
| `useFsmSelector(fsm, selector, options?)`                   | Snapshot hook. Rerenders only when the selected slice changes                |
| `useBehavioralFsmSelector(fsm, client, selector, options?)` | Snapshot hook. The selector variant for one client                           |
| `useFsmEvent(fsm, eventName, callback)`                     | Event hook. Runs a callback on an FSM event without causing a rerender       |
| `useBehavioralFsmEvent(fsm, client, eventName, callback)`   | Event hook. The same, filtered to one client                                 |
| `shallowEqual`                                              | Equality helper for selectors that return object literals                    |

## Snapshot Hooks

`useFsm(fsm)` returns a settled snapshot, one taken after an input and its transitions finish processing, with:

- `state`
- `compositeState`
- `context`, as the live machina context reference
- `handle(inputName, ...args)`
- `canHandle(inputName)`

Under an FSM with an [input payload map](https://machina-js.org/guide/typed-payloads/), the snapshot's `handle` enforces the declared payloads, with the same checking core's `handle` applies.

`useBehavioralFsm(fsm, client)` returns the matching snapshot shape for a behavioral client, with `client` in place of `context`. The snapshot's `handle` is bound to the client. A client the FSM hasn't handled yet reports `state: undefined` and `compositeState: ""` until machina initializes it.

```tsx
import { useBehavioralFsm } from "machina-react";

// sessionFsm = createBehavioralFsm<Session>()({ ... }) at module scope
const SessionBadge = ({ session }: { session: Session }) => {
    const { state, handle } = useBehavioralFsm(sessionFsm, session);

    return <button onClick={() => handle("refresh")}>{state}</button>;
};
```

## Render Triggers

Snapshot hooks default to `rerenderOn: "settled"`.

```ts
useFsm(fsm, { rerenderOn: "settled" });
```

Modes:

- `"settled"` subscribes to `handled` and `transitioned`, then coalesces synchronous event bursts with `queueMicrotask()` so React renders only the final snapshot.
- `"transitioned"` rerenders only after transitions.
- `"handled"` rerenders only after handled inputs.
- `"all"` subscribes to both and notifies immediately.

## Selectors

```tsx
import { shallowEqual, useFsmSelector } from "machina-react";

const state = useFsmSelector(fsm, snapshot => snapshot.state);
const summary = useFsmSelector(
    fsm,
    snapshot => ({
        state: snapshot.state,
        total: snapshot.context.total,
    }),
    { isEqual: shallowEqual }
);
```

Select primitives by default. For multiple fields, return a small object literal and pass `shallowEqual`. Avoid selecting mutated context or client sub-objects directly because their references may not change.

`useBehavioralFsmSelector(fsm, client, selector, options?)` is the behavioral variant:

```tsx
const state = useBehavioralFsmSelector(sessionFsm, session, snapshot => snapshot.state);
```

## Event Hooks

```tsx
import { useBehavioralFsmEvent, useFsmEvent } from "machina-react";

useFsmEvent(fsm, "transitioned", payload => {
    console.log(payload.toState);
});

useFsmEvent(fsm, "*", (eventName, payload) => {
    console.log(eventName, payload);
});

useBehavioralFsmEvent(fsm, client, "handled", payload => {
    console.log(payload.client, payload.inputName);
});
```

Event hooks subscribe in an effect and read the latest callback through a ref. They do not update React state internally, so events do not cause renders unless your callback does.

Custom events subscribe by name too. Under an FSM that declares an event map (`createFsm<{ events: MyEvents }>()`), the hook accepts the declared names and types each payload, and an undeclared name is a compile error. Without a map, any name is accepted and the payload is `unknown`.

```tsx
useFsmEvent(light, "cycleCompleted", ({ cycles }) => {
    console.log(cycles); // number, from the declared map
});
```

Behavioral event hooks filter built-in client-bearing payloads to the matching client. Wildcard subscriptions also receive clientless custom events as global events.

## App Context

Wrap FSM instances with ordinary React context when you want a provider:

```tsx
const CheckoutFsmContext = createContext<CheckoutFsm | null>(null);
```

Store the FSM instance in context, then call `useFsm(fsm)` or `useFsmSelector(fsm, selector)` in app hooks.

## V1 Non-Goals

- Context factory helpers such as `createFsmContext` and `createBehavioralFsmContext`
- SSR support via `getServerSnapshot`
- Devtools or inspector integration

## See Also

- [machina](https://machina-js.org), the FSM library these hooks subscribe to
- [examples/with-react](https://github.com/ifandelse/machina.js/tree/master/examples/with-react), a working app built on these hooks

## License

MIT
