# machina

Focused finite state machines for JavaScript and TypeScript. States in, states out.

## Install

```
npm install machina
```

## Quick start — `createFsm`

`createFsm` is the standard choice: one config, one FSM instance, one internal context object. Handler signatures receive a `{ ctx, inputName, defer, emit }` args object — no `this`, works with arrow functions.

Handlers return a state name to transition, or nothing to stay put.

```ts
import { createFsm } from "machina";

const light = createFsm({
    id: "traffic-light",
    initialState: "green",
    context: { tickCount: 0 },
    states: {
        green: {
            _onEnter({ ctx }) {
                ctx.tickCount = 0;
            },
            tick({ ctx }) {
                ctx.tickCount++;
            },
            timeout({ ctx }) {
                if (ctx.tickCount >= 5) return "yellow";
            },
        },
        yellow: {
            timeout: "red", // string shorthand — always transitions
        },
        red: {
            timeout: "green",
        },
    },
});

light.handle("tick");
light.handle("tick");
light.handle("timeout"); // stays green — tickCount is 2, not >= 5

light.currentState(); // "green"
light.compositeState(); // "green" (dot-delimited path, useful with child FSMs)
light.canHandle("timeout"); // true

light.reset(); // back to initialState, fires _onEnter
light.dispose(); // tears down; all subsequent calls are silent no-ops
```

### Public API — `Fsm`

| Method                       | Description                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| `handle(inputName, ...args)` | Dispatch an input to the current state's handler                   |
| `canHandle(inputName)`       | True if the current state has a handler (or `"*"`) for this input  |
| `transition(toState)`        | Directly transition; fires `_onExit`, `_onEnter`, lifecycle events |
| `reset()`                    | Transition back to `initialState`                                  |
| `currentState()`             | Returns the current state name                                     |
| `compositeState()`           | Dot-delimited path including active child FSM states               |
| `on(eventName, callback)`    | Subscribe to a lifecycle event (returns `{ off() }`)               |
| `emit(eventName, data?)`     | Emit a custom event                                                |
| `dispose(options?)`          | Permanently shut down; cascades to child FSMs by default           |

## `createBehavioralFsm`

`createBehavioralFsm` defines behavior once and applies it to any number of independent client objects. Per-client state lives in a `WeakMap` — no properties are stamped onto the client. The client object IS the context; handlers receive it as `ctx`.

The client type is provided as an explicit type parameter since it can't be inferred from the config.

```ts
import { createBehavioralFsm } from "machina";

interface Connection {
    url: string;
    retries: number;
}

const connFsm = createBehavioralFsm<Connection>({
    id: "connectivity",
    initialState: "disconnected",
    states: {
        disconnected: {
            connect: "connecting",
        },
        connecting: {
            connected: "online",
            failed({ ctx }) {
                ctx.retries++;
                if (ctx.retries >= 3) return "error";
                return "disconnected";
            },
        },
        online: {
            disconnect: "disconnected",
        },
        error: {
            reset({ ctx }) {
                ctx.retries = 0;
                return "disconnected";
            },
        },
    },
});

const connA = { url: "wss://host-a.example.com", retries: 0 };
const connB = { url: "wss://host-b.example.com", retries: 0 };

connFsm.handle(connA, "connect");
connFsm.handle(connB, "connect");
connFsm.handle(connB, "failed");

connFsm.currentState(connA); // "connecting"
connFsm.currentState(connB); // "disconnected"
```

`BehavioralFsm` has the same API as `Fsm`, except every method takes the client object as its first argument.

## Hierarchical states

Attach a child FSM to any state via `_child`. Inputs are dispatched to the child first; unhandled inputs bubble up to the parent.

```ts
import { createFsm } from "machina";

const childFsm = createFsm({
    id: "upload-phases",
    initialState: "preparing",
    context: {},
    states: {
        preparing: { ready: "uploading" },
        uploading: { done: "verifying" },
        verifying: { verified: "complete" },
        complete: {},
    },
});

const uploader = createFsm({
    id: "uploader",
    initialState: "idle",
    context: {},
    states: {
        idle: {
            start: "active",
        },
        active: {
            _child: childFsm, // delegates inputs here first
            cancel: "idle", // "cancel" is not on childFsm, so it bubbles up here
        },
    },
});

uploader.handle("start");
uploader.compositeState(); // "active.preparing"

uploader.handle("ready");
uploader.compositeState(); // "active.uploading"

uploader.handle("cancel");
uploader.compositeState(); // "idle"
```

The parent re-enters `initialState` of the child FSM whenever the parent transitions into the state that owns `_child`.

## Deferred input

Call `defer()` inside a handler to queue the current input for replay after the next transition. Pass `{ until: "stateName" }` to replay only on entry to a specific state.

```ts
const fsm = createFsm({
    id: "loader",
    initialState: "loading",
    context: {},
    states: {
        loading: {
            _onEnter() {
                // simulate async load completing
                setTimeout(() => fsm.handle("loaded"), 100);
            },
            // Can't process "save" while still loading — replay it later
            save({ defer }) {
                defer({ until: "ready" });
            },
            loaded: "ready",
        },
        ready: {
            save() {
                // deferred "save" replays here automatically after transitioning in
                console.log("saving");
            },
        },
    },
});

fsm.handle("save"); // deferred — not yet in "ready"
// after "loaded" fires and transitions to "ready", "save" replays automatically
```

## Events

Both `Fsm` and `BehavioralFsm` emit lifecycle events you can subscribe to with `on()`. Use `"*"` to catch everything.

```ts
const sub = light.on("transitioned", ({ fromState, toState }) => {
    console.log(`${fromState} -> ${toState}`);
});

sub.off(); // unsubscribe

// wildcard — receives every event
light.on("*", (eventName, data) => {
    console.log(eventName, data);
});
```

### Built-in events

| Event           | Payload                  | Fired when                              |
| --------------- | ------------------------ | --------------------------------------- |
| `transitioning` | `{ fromState, toState }` | A transition is about to occur          |
| `transitioned`  | `{ fromState, toState }` | A transition completed                  |
| `handling`      | `{ inputName }`          | An input is about to be dispatched      |
| `handled`       | `{ inputName }`          | An input was successfully handled       |
| `nohandler`     | `{ inputName, args }`    | No handler found in current state       |
| `invalidstate`  | `{ stateName }`          | Transition targeted a nonexistent state |
| `deferred`      | `{ inputName }`          | An input was deferred                   |

`BehavioralFsm` events include a `client` field in every payload to identify which client the event pertains to.

## TypeScript

machina is written in TypeScript. State names, input names, and handler signatures are all inferred from the config object — no manual type parameters needed for `createFsm`.

```ts
import type {
    FsmConfig,
    FsmEventMap,
    BehavioralFsmEventMap,
    HandlerArgs,
    HandlerFn,
    StateNamesOf,
    InputNamesOf,
    Subscription,
    DisposeOptions,
} from "machina";

// StateNamesOf and InputNamesOf extract literal unions from your states config:
// type MyStates = StateNamesOf<typeof myConfig.states>; // "green" | "yellow" | "red"
// type MyInputs = InputNamesOf<typeof myConfig.states>; // "tick" | "timeout"
```

Transition targets in string shorthand are validated against actual state keys at compile time. A typo like `timeout: "yellw"` is a type error.

## Disposal

`dispose()` permanently shuts down an FSM. All subsequent method calls are silent no-ops. Child FSMs are disposed by default.

```ts
fsm.dispose(); // also disposes child FSMs

fsm.dispose({ preserveChildren: true }); // leave child FSMs running
```

## Companion tools

- [machina-inspect](https://www.npmjs.com/package/machina-inspect) — static analysis for FSM configs: unreachable states, `_onEnter` loops, missing handlers.
- [machina-test](https://www.npmjs.com/package/machina-test) — Jest/Vitest custom matchers for testing FSM graph topology. Assert reachability and catch dead states from your test suite.
- [eslint-plugin-machina](https://www.npmjs.com/package/eslint-plugin-machina) — ESLint plugin wrapping machina-inspect for inline editor feedback.

## Full documentation

https://machina-js.org

## License

MIT
