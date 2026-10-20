# machina

<!-- sync:intro -->

machina is a small library for building finite state machines in JavaScript and TypeScript. States in, states out.

[Documentation](https://machina-js.org) · [npm](https://www.npmjs.com/package/machina) · [GitHub](https://github.com/ifandelse/machina.js)

<!-- /sync:intro -->

- [The Case for State Machines](#the-case-for-state-machines)
- [Show Me (the Money)](#show-me-the-money)
    - [Installation](#installation)
    - [The Mental Model](#the-mental-model)
    - [One, or Many](#one-or-many)
    - [Features in the Order You'll Probably Need Them](#features-in-the-order-youll-probably-need-them)
    - [Your FSM is a Data Structure](#your-fsm-is-a-data-structure)
- [machina vs XState](#machina-vs-xstate)
- [Versions and Migrating](#versions-and-migrating)
- [Contributing](#contributing)
- [License](#license)

<!-- sync:case -->

## The Case for State Machines

Of all the roads that lead to state bugs, the broadest ones are paved with well-intended booleans. You start with `isConnecting`, then add `hasFailed`, then `retryCount` and `hasExceededRetryCount`, and soon every callback checks some combination of these. Each new flag doubles the possible combinations (or worse). Some combinations are nonsense, like a connection that is both connecting and connected. The trickiest part of this is that the bugs tend to appear in the combinations no one ever considered, and it's much easier to spot the nonsense combinations explicitly represented in code than the actually-relevant ones that aren't.

A finite state machine (FSM) replaces these flags with one named state at a time. The same input can mean different things in each state, including nothing at all. Impossible combinations become unrepresentable. Behavior is grouped by state instead of scattered across callbacks, or wildly branching code, and the FSM's config itself documents how the machine behaves.

You already think this way. You describe connection status or the stages of an order in states. A state machine makes the code match that description. The pattern predates JavaScript by decades and it appears everywhere, from network protocols, parsers, to game AI.

If a plain boolean covers your case, use the boolean. However, if you need to tame a herd of booleans, or if changing the aggregate state of those flags needs to follow rules, or when what happens next depends on what is happening now, then you need an FSM. [The Case for State Machines](https://machina-js.org/guide/why-state-machines/) on the docs site makes the longer argument, with a before-and-after refactor.

<!-- /sync:case -->

<!-- sync:show-me -->

## Show Me (the Money)

You use a physical state machine every day: a door lock. It can be in a `locked` or `unlocked` state. Your "input" (trying to open the door) has a different outcome based on the state the door lock is in.

Here's an FSM that represents a fancier, key code lock. It opens with the right code and sounds an alarm after three wrong attempts:

```ts
import { createFsm } from "machina";

const lock = createFsm({
    id: "door-lock",
    initialState: "locked",
    context: { attempts: 0 },
    states: {
        locked: {
            submit({ ctx }, code: unknown) {
                if (code === "1234") {
                    ctx.attempts = 0;
                    return "unlocked";
                }
                ctx.attempts++;
                if (ctx.attempts >= 3) {
                    return "alarming";
                }
            },
        },
        unlocked: {
            lock: "locked",
        },
        alarming: {
            reset({ ctx }) {
                ctx.attempts = 0;
                return "locked";
            },
        },
    },
});

lock.handle("submit", "wrong"); // stays in "locked"
lock.handle("submit", "1234"); // transitions to "unlocked"
lock.handle("lock"); // back to "locked"

console.log(lock.currentState()); // "locked"
```

This FSM's states are the top-level properties under `states`: `locked`, `unlocked`, and `alarming`.

The handlers (which are the methods attached to the state properties) return a state name to transition to a new state, or return nothing to remain in the current state. String shorthand (`lock: "locked"`) is for handlers that always transition to the same state. The `submit` handler shows the other case, a transition that depends on context.

The [examples directory](./examples/) has fuller examples of FSMs:

- [connectivity](./examples/connectivity/) for a realistic `createFsm`
- [traffic-intersection](./examples/traffic-intersection/) for hierarchy
- [dungeon-critters](./examples/dungeon-critters/) for one FSM managing many clients.

### Installation

```sh
npm install machina
# or
pnpm add machina
```

The package includes CJS and ESM builds and TypeScript type definitions.

### The Mental Model

- States are keys in the config, and inputs are keys inside each state. Handlers return the next state, or nothing.
- Handlers receive `{ ctx, inputName, defer, emit }` as a plain argument. There is no `this` binding, so arrow functions work everywhere.
- `ctx` is your data (the internal state you want to keep track of inside the FSM). For `createFsm` it is the FSM's own `context` object, and for `createBehavioralFsm` it is the client (more on this later).
- Every method is synchronous. Start async work in `_onEnter`, then call `handle()` or `transition()` when the work completes.
- Read the config from top to bottom and you know the complete behavior of the machine.

### One, or Many

The note above about the `ctx` argument mentioned the two FSM factories in machina:

`createFsm` builds one machine with its own `context` object. Use it for one instance of a thing, like the lock above.

`createBehavioralFsm` defines the _behavior_ once and applies it to any number of client objects. machina tracks each client's state in a `WeakMap` and doesn't write properties onto your objects. This can be incredibly useful, freeing you from having to manage n-number of FSM instances, and instead, just let your plain application objects use an FSM's behavior as if they were the only one using it.

```ts
import { createBehavioralFsm } from "machina";

interface Connection {
    url: string;
    retries: number;
}

const connFsm = createBehavioralFsm<Connection>()({
    id: "connectivity",
    initialState: "disconnected",
    states: {
        disconnected: { connect: "connecting" },
        connecting: {
            connected: "online",
            failed({ ctx }) {
                ctx.retries++;
                return "disconnected";
            },
        },
        online: { disconnect: "disconnected" },
    },
});

const connA = { url: "wss://a.example.com", retries: 0 };
const connB = { url: "wss://b.example.com", retries: 0 };

connFsm.handle(connA, "connect"); // connA: "connecting"
connFsm.handle(connB, "connect"); // connB: "connecting"
connFsm.handle(connA, "connected"); // connA: "online"
connFsm.handle(connB, "failed"); // connB: "disconnected", retries: 1
```

**IMPORTANT**: The extra `()` in `createBehavioralFsm<Connection>()` fixes the client type before TypeScript infers the rest from the config. Methods that act on one client (`handle`, `canHandle`, `transition`, `reset`, `currentState`, `compositeState`, `dehydrate`, `rehydrate`) take that client as their first argument, and handlers receive the client as `ctx`, so put per-client data on the client. The instance-wide methods (`on`, `emit`, `dispose`) don't take a client. The config-level `onDispose` hook runs once per client when you call `dispose()`, with that client as `ctx`.

### Features in the Order You'll Probably Need Them

- When one machine grows too large, nest another machine inside a state with [`_child`](https://machina-js.org/guide/hierarchical/). The child receives each input first, and unhandled inputs bubble up to the parent.
- When the machine receives an input it cannot act on yet, [`defer()`](https://machina-js.org/guide/defer/) queues that input for replay after the next transition.
- When the rest of your app needs to react to the machine, subscribe to [lifecycle events](https://machina-js.org/guide/events/) such as `transitioned` and `nohandler`.
- When you want the compiler to check every `handle()` call, declare [typed input payloads](https://machina-js.org/guide/typed-payloads/). Misspelled inputs and wrong payloads then become compile errors.

### Your FSM is a Data Structure

An FSM config is plain data, so tools can analyze it without executing it.

- [machina-inspect](./packages/machina-inspect/) parses a config into a graph and reports unreachable states, `_onEnter` loops, and missing handlers.
- [machina-test](./packages/machina-test/) adds Jest and Vitest matchers, so your test suite can assert reachability and structure.
- [eslint-plugin-machina](./packages/eslint-plugin-machina/) reports the same findings inline in your editor.

<!-- /sync:show-me -->

<!-- sync:xstate -->

## machina vs XState

I'm frequently asked about the differences between machina and XState.

machina was inspired by Erlang/OTP's gen_fsm module, and follows the same priorities: a small API, pragmatic, focused, minimal ceremony, and straightforward to reason about. [XState](https://xstate.js.org/) is a full statechart framework with actors, spawning, inspection tooling, and SCXML compatibility. It's a phenomenal library. If you need those features, use it. machina is for when you want a state machine (or a hierarchy of them) and nothing else.

<!-- /sync:xstate -->

<!-- sync:versions -->

## Versions and Migrating

machina v8 is the current major version. v6 redesigned the API around plain config objects and handlers that receive `{ ctx }` instead of `this`. v7 extended hierarchical delegation to any depth and turned config typos into compile errors. v8 added [typed input payloads](https://machina-js.org/guide/typed-payloads/), and the [v7 to v8 guide](https://machina-js.org/migration/v7-to-v8/) covers its one type-level break. Readers on v5 or earlier should read the [v5 to v6 guide](https://machina-js.org/migration/v5-to-v6/) and then the [v6 to v7 guide](https://machina-js.org/migration/v6-to-v7/) first.

<!-- /sync:versions -->

## Contributing

machina is a pnpm and Turborepo monorepo. The core library is [packages/machina](./packages/machina/), each companion tool has its own package, and runnable examples are in [examples/](./examples/).

```sh
git clone https://github.com/ifandelse/machina.js.git
cd machina.js
pnpm install
pnpm run checks   # lint + test + build, the same gate CI runs
```

[DEVELOP.md](./DEVELOP.md) has the full development guide, including the required Node and pnpm versions. machina is MIT licensed and also available under GPL-2.0 (see [LICENSE](./LICENSE)).

## License

MIT + GPL-2.0 — see [LICENSE](./LICENSE)

&copy; Jim Cowart
