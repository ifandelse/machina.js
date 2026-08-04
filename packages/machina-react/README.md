# machina-react

React external-store hooks for existing machina FSM instances.

`machina-react` does not create or own FSM instances. Keep ownership in app code, module scope, or normal React context, then pass the instance to these hooks.

## Install

```bash
pnpm add machina machina-react react
```

React 18 or newer is required.

## Store Hooks

```tsx
import { useFsm } from "machina-react";

const CheckoutStep = ({ fsm }) => {
    const { state, compositeState, context, handle, canHandle } = useFsm(fsm);

    return (
        <button disabled={!canHandle("submit")} onClick={() => handle("submit")}>
            {state}
        </button>
    );
};
```

`useFsm(fsm)` returns a settled snapshot with:

- `state`
- `compositeState`
- `context`, as the live machina context reference
- `handle(inputName, ...args)`
- `canHandle(inputName)`

`useBehavioralFsm(fsm, client)` returns a matching snapshot shape for a behavioral client, with `client` instead of `context`. Unseen clients report `state: undefined` and `compositeState: ""` until machina initializes them.

## Render Triggers

Render hooks default to `rerenderOn: "settled"`.

```ts
useFsm(fsm, { rerenderOn: "settled" });
```

Modes:

- `"settled"` subscribes to `handled` and `transitioned`, then coalesces synchronous event bursts with `queueMicrotask()` so React sees the final snapshot.
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

## Events

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

Event hooks subscribe in an effect and keep the callback fresh through a ref. They do not update React state internally, so events do not cause renders unless your callback does.

Behavioral event hooks filter built-in client-bearing payloads to the matching client. Wildcard subscriptions also receive clientless custom events as global events.

## App Context

V1 does not include context factory helpers. Wrap FSM instances with ordinary React context when an app wants a provider.

```tsx
const CheckoutFsmContext = createContext<CheckoutFsm | null>(null);
```

Store the FSM instance in context, then call `useFsm(fsm)` or `useFsmSelector(fsm, selector)` in app hooks.

## V1 Non-Goals

- No `createFsmContext` or `createBehavioralFsmContext`
- No SSR `getServerSnapshot` support
- No devtools or inspector integration
