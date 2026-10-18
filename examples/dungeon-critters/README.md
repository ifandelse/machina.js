# Dungeon Critters

A machina example of `createBehavioralFsm`: one FSM definition drives up to 80
independent critters at once, each with its own tracked state. The
[createBehavioralFsm guide](https://machina-js.org/guide/behavioral-fsm/) covers
the API in depth.

## What This Demonstrates

**`createBehavioralFsm` vs `createFsm`**

With `createFsm`, the FSM instance stores its own state (one machine, one state).
With `createBehavioralFsm`, the FSM tracks state in a `WeakMap` keyed on a
client object. The FSM is a shared behavior definition, and you pass a client
object with every call:

```ts
// One FSM definition
const fsm = createCritterBehavior();

// Drives every critter independently
fsm.handle(critterA, "playerDetected");
fsm.handle(critterB, "tick", { playerX, playerY, dt });
fsm.currentState(critterA); // "alert"
fsm.currentState(critterB); // "idle"
```

Each critter object is the "client", and the FSM doesn't write bookkeeping onto
it, because the WeakMap is internal. Handlers do read and write its properties,
such as velocity, timestamps, and patrol targets, as behavioral side effects.

## Critter States

```
             playerDetected        playerInRange
  idle ──────────────────► alert ──────────────► chase
    ▲  ◄──── fidget ──────── │  ▲                  │
    │                         │  │ playerLostContact │ playerLostContact
    │   patrol ◄──────────────┘  └──────────────────┘
    ▲     │  ▲
    │     │  │ playerDetected            attacked
    │     └──┘                              │
    └──────────── flee ◄────────────────── chase
                   │
                   └── (timer: FLEE_DURATION_MS) ──► idle
```

| State    | Color      | Behavior                                                                           |
| -------- | ---------- | ---------------------------------------------------------------------------------- |
| `idle`   | grey       | Stationary with an occasional random fidget. Drifts back to its territory center   |
| `patrol` | green      | Moves toward a random waypoint within its home territory circle                    |
| `alert`  | amber      | Stops to face the player with a blinking "!" indicator. Auto-disengages after 2.5s |
| `chase`  | red        | Pursues the cursor at full speed and inflates visually                             |
| `flee`   | near-white | Runs away from the click point for 2s with speed lines, then returns to idle       |

## Key Design Decisions

**No timers in the FSM.** With 50+ critters, 50 independent `setTimeout` chains
would be chaotic. Instead, `_onEnter` records `Date.now()` on the client, and the
tick handler compares elapsed time. One `requestAnimationFrame` loop drives everything.

**The FSM sets velocity, and the game loop integrates position.** Handlers write
`critter.vx` / `critter.vy` to express movement intent. The game loop applies
`x += vx` and clamps to canvas bounds. The pixel math runs in the loop, outside
the handlers.

**State-to-color is looked up at render time, not stored on the client.** The
renderer calls `fsm.currentState(critter)` each frame and maps that to a color.
The client stores only behavioral data.

**Lazy initialization.** No explicit init call needed. The first
`fsm.handle(critter, "tick")` triggers lazy entry into `idle` and runs `_onEnter`.

**Per-client event filtering.** The inspector uses `fsm.on("*", callback)` with
one wildcard subscription. Built-in event payloads include the `client`
reference, so filtering by `payload.client === selectedCritter` gives a
per-critter event stream without separate channels.

## Interacting With the Demo

- **Move the cursor** over critters to trigger detection and chase
- **Click** to blast critters within range (80px radius), and chasing critters flee
- **Click directly on a critter** to select it and open the inspector panel
- **Sensing range slider**: adjust the detection radius live for every critter
- **Show sensing radius**: toggles the detection circle
- **Spawn**: adds 10 more critters (up to the 80 cap, from 35 at startup)

## Running

From this directory:

```sh
pnpm dev
```

From the repo root:

```sh
pnpm --filter @machina-examples/dungeon-critters dev
```

## Testing

```sh
pnpm test
```

Tests cover the full FSM lifecycle (`fsm.test.ts`) and the critter spawn factory
(`critter.test.ts`). The tests set timestamps on the client object directly, so
timer mocking is unnecessary.

## File Overview

| File              | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `src/fsm.ts`      | `createBehavioralFsm` definition, the point of this example |
| `src/critter.ts`  | `CritterClient` type and `spawnCritters` factory            |
| `src/config.ts`   | All tuning constants and color palette                      |
| `src/main.ts`     | Game loop, input dispatch, wiring                           |
| `src/renderer.ts` | Canvas 2D drawing                                           |
| `src/ui.ts`       | Controls panel and critter inspector                        |
