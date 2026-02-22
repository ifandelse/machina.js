# Dungeon Critters

A machina.js v6 example demonstrating `createBehavioralFsm`: one FSM definition
driving 30-80 independent critters simultaneously, each with its own tracked state.

## What This Demonstrates

**`createBehavioralFsm` vs `createFsm`**

With `createFsm`, state lives inside the FSM instance — one machine, one state.
With `createBehavioralFsm`, state is tracked externally via WeakMap keyed on a
client object. The FSM is a shared behavior definition; you pass a client object
with every call:

```ts
// One FSM definition
const fsm = createCritterBehavior();

// Drives every critter independently
fsm.handle(critterA, "playerDetected");
fsm.handle(critterB, "tick", { playerX, playerY, dt });
fsm.currentState(critterA); // "alert"
fsm.currentState(critterB); // "idle"
```

Each critter object is the "client" — the FSM stores nothing on it directly
(the WeakMap is internal), but handlers read and write properties on it
(velocity, timestamps, patrol targets) as behavioral side effects.

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

| State    | Behavior                                                                            |
| -------- | ----------------------------------------------------------------------------------- |
| `idle`   | Stationary; occasional random fidget; drifts back to territory center if it strayed |
| `patrol` | Moves toward a random waypoint within its home territory circle                     |
| `alert`  | Stops and faces the player; blinking "!" indicator; auto-disengages after 2.5s      |
| `chase`  | Pursues the cursor at full speed; inflates visually                                 |
| `flee`   | Runs away from the click point for 2s then returns to idle; speed lines rendered    |

**Color coding:** grey (idle), green (patrol), amber (alert), red (chase), near-white (flee).

## Key Design Decisions

**No timers in the FSM.** With 50+ critters, 50 independent `setTimeout` chains
would be chaotic. Instead, `_onEnter` records `Date.now()` on the client, and the
tick handler compares elapsed time. One `requestAnimationFrame` loop drives everything.

**FSM sets velocity; game loop integrates position.** Handlers write `critter.vx` /
`critter.vy` (behavioral intent). The game loop applies `x += vx` and clamps to
canvas bounds. FSM handlers stay focused on "what the critter wants," not pixel math.

**State-to-color is looked up at render time, not stored on the client.** The
renderer calls `fsm.currentState(critter)` each frame and maps that to a color.
The client carries only behavioral data.

**Lazy initialization.** No explicit init call needed. The first
`fsm.handle(critter, "tick")` triggers lazy entry into `idle` and runs `_onEnter`.

**Per-client event filtering.** The inspector uses `fsm.on("*", callback)` with a
single wildcard subscription. The payload always includes the `client` reference,
so filtering by `payload.client === selectedCritter` gives a per-critter event
stream without separate channels.

## Interacting With the Demo

- **Move the cursor** over critters to trigger detection and chase
- **Click** to blast critters within range (80px radius) — only chasing critters flee
- **Click directly on a critter** to select it and open the inspector panel
- **Sensing range slider** — adjust detection radius live for all critters
- **Show sensing radius** — toggle detection circle visualization
- **Spawn** — add 10 more critters (up to 80 max)

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
(`critter.test.ts`). No timers are involved — tests control `Date.now()` via
timestamp manipulation on the client object.

## File Overview

| File              | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `src/fsm.ts`      | `createBehavioralFsm` definition — the point of this example |
| `src/critter.ts`  | `CritterClient` type and `spawnCritters` factory             |
| `src/config.ts`   | All tuning constants and color palette                       |
| `src/main.ts`     | Game loop, input dispatch, wiring                            |
| `src/renderer.ts` | Canvas 2D drawing                                            |
| `src/ui.ts`       | Controls panel and critter inspector                         |
