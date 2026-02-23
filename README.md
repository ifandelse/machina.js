# machina

Focused finite state machines for JavaScript and TypeScript. States in, states out.

**v6 is active.** The API has been substantially redesigned — cleaner handler signatures, TypeScript-first, and a BehavioralFsm that tracks state per-client instead of stamping properties on your objects.

- [Documentation](https://ifandelse.github.io/machina.js/)
- [npm](https://www.npmjs.com/package/machina)
- [GitHub](https://github.com/ifandelse/machina.js)

---

## Install

```sh
npm install machina
# or
pnpm add machina
```

---

## Quick Example

A door lock that only unlocks with the right code:

```ts
import { createFsm } from "machina";

const lock = createFsm({
    id: "door-lock",
    initialState: "locked",
    context: { attempts: 0 },
    states: {
        locked: {
            submit({ ctx }, code: unknown) {
                ctx.attempts++;
                if (code === "1234") {
                    return "unlocked";
                }
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

Handlers return a state name to transition, or nothing to stay put. String shorthand (`lock: "locked"`) handles the simple cases.

---

## Two APIs

### `createFsm` — single-client

The FSM owns its own context. Use this when you have one instance of a thing.

```ts
const fsm = createFsm({
    id: "my-fsm",
    initialState: "idle",
    context: { count: 0 },
    states: {
        idle: {
            start: "running",
        },
        running: {
            stop: "idle",
            tick({ ctx }) {
                ctx.count++;
            },
        },
    },
});

fsm.handle("start");
fsm.handle("tick");
console.log(fsm.currentState()); // "running"
```

### `createBehavioralFsm` — multi-client

The FSM defines behavior; state is tracked per-client object in a `WeakMap`. One FSM definition, any number of independent clients.

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

---

## Features

**Hierarchical states** — nest child FSMs inside parent states via `_child`. Inputs delegate to the child first and bubble up on `nohandler`.

**Deferred input** — call `defer()` inside a handler to re-queue the input for replay after the next transition. Optionally target a specific state with `defer({ until: "someStateName" })`.

**Lifecycle hooks** — `_onEnter` and `_onExit` on any state. Returning a state name from `_onEnter` causes an immediate bounce transition.

**Event emission** — subscribe to built-in lifecycle events (`transitioning`, `transitioned`, `handling`, `handled`, `nohandler`, `deferred`) or emit your own from handlers via the `emit` handler arg.

**TypeScript-first** — state names, input names, and transition targets are all inferred from your config. Typos in string shorthand are compile errors.

**Disposal** — `dispose()` is permanent, irreversible, and cascades to child FSMs by default. All post-dispose calls are silent no-ops.

---

## How does machina differ from other state machine libraries?

Machina was originally inspired by the `gen_fsm` behavior module for Erlang/OTP. While TypeScript/JavaScript are a very different landscape than Erlang, machina seeks to preserve some of the same qualities: pragmatic, focused, minimal ceremony, and straightforward to reason about.

Other options exist — most notably [XState](https://xstate.js.org/). XState is a comprehensive statechart framework with actors, spawning, inspection tools, and SCXML compatibility. It's a phenomenal library — if you need those features, use it. Machina is for when you want a state machine (or a hierarchy of them) and nothing else.

---

## Monorepo Structure

```
machina.js/
  packages/
    machina/          # core library (what you install from npm)
    docs/             # Astro Starlight documentation site
  examples/
    connectivity/     # network connectivity monitor (createFsm)
    traffic-intersection/ # hierarchical FSM with child states
    dungeon-critters/ # createBehavioralFsm example
    shopping-cart/    # defer() showcase
    with-react/       # React integration example
```

---

## Development

Requires Node >= 22.22 and pnpm 10.29.3.

```sh
git clone https://github.com/ifandelse/machina.js.git
cd machina.js
pnpm install
pnpm turbo build
pnpm turbo test
```

To work on a specific package:

```sh
cd packages/machina
pnpm dev    # tsdown in watch mode
pnpm test   # jest
```

---

## License

MIT + GPL-2.0 — see [LICENSE](./LICENSE)

&copy; Jim Cowart
