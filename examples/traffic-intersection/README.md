# Traffic Intersection — machina.js v6 Example

A canvas-rendered traffic intersection that demonstrates hierarchical FSMs in machina v6. The point isn't the animation — it's the state machine architecture underneath.

## What This Demonstrates

Five machina v6 features working together in a realistic scenario:

1. **`_child` delegation** — parent states forward inputs to an active child FSM automatically
2. **Input bubbling** — `phaseComplete` has no handler in the child's `red` state, so it bubbles up to the parent
3. **`compositeState()`** — returns `"northSouthPhase.green"` as a single readable string, combining parent and child state
4. **Child auto-reset** — when the parent re-enters a phase state, machina calls `reset()` on the child automatically, returning it to `green`
5. **`defer()`** — a pedestrian button press during non-interruptible green is queued and replayed automatically when `interruptibleGreen` is entered

## State Hierarchy

```
Intersection (parent FSM)
  ready                    — all signals red, waiting for Start
  northSouthPhase          — N/S has right-of-way
    _child: nsPhaseCtrl    — delegates to child FSM
  clearanceNS              — all-red interval, parent owns the timer
  eastWestPhase            — E/W has right-of-way
    _child: ewPhaseCtrl    — delegates to child FSM
  clearanceEW              — all-red interval, parent owns the timer

PhaseController (child FSM — one factory, two instances)
  green                    — 3s, pedestrianRequest deferred here
  interruptibleGreen       — 6s, pedestrianRequest shortens the phase
  yellow                   — 2.5s caution interval
  red                      — emits phaseComplete, bubbles to parent
```

The two child instances (`nsPhaseCtrl` and `ewPhaseCtrl`) are created by the same factory but have independent context objects and timers. They never share state.

## Signal State Mapping

`compositeState()` drives everything the renderer shows. The lookup table in `config.ts` maps every composite state string to visual signal states for all four directions:

| Composite State                      | N/S Vehicle | N/S Ped    | E/W Vehicle | E/W Ped    |
| ------------------------------------ | ----------- | ---------- | ----------- | ---------- |
| `ready`                              | red         | don't walk | red         | don't walk |
| `northSouthPhase.green`              | green       | walk       | red         | don't walk |
| `northSouthPhase.interruptibleGreen` | green       | flashing   | red         | don't walk |
| `northSouthPhase.yellow`             | yellow      | don't walk | red         | don't walk |
| `northSouthPhase.red`                | red         | don't walk | red         | don't walk |
| `clearanceNS`                        | red         | don't walk | red         | don't walk |
| `eastWestPhase.green`                | red         | don't walk | green       | walk       |
| `eastWestPhase.interruptibleGreen`   | red         | don't walk | green       | flashing   |
| `eastWestPhase.yellow`               | red         | don't walk | yellow      | don't walk |
| `eastWestPhase.red`                  | red         | don't walk | red         | don't walk |
| `clearanceEW`                        | red         | don't walk | red         | don't walk |

## Phase Timing

Defined in `src/config.ts`:

| Phase               | Duration |
| ------------------- | -------- |
| Green (locked)      | 3s       |
| Interruptible green | 6s       |
| Yellow              | 2.5s     |
| All-red clearance   | 2.75s    |

## The Pedestrian Button

Pressing it during non-interruptible green defers the request. `defer({ until: "interruptibleGreen" })` tells machina to queue the input and replay it automatically when that state is entered. The button press "works" — it just takes effect at the earliest safe moment.

During `interruptibleGreen` (whether from a live press or a deferred replay), the phase transitions immediately to yellow. During yellow, clearance, or ready, the input is unhandled and fires a `nohandler` event.

## Running

From this directory:

```sh
pnpm dev
```

From the repo root:

```sh
pnpm --filter @machina-examples/traffic-intersection dev
```

## Testing

```sh
pnpm test
```

Tests use Jest fake timers to drive the FSM through its full cycle without waiting. Coverage includes: normal progression, pedestrian defer/replay, child auto-reset across cycles, and disposal behavior.

## File Guide

| File              | What it does                                                   |
| ----------------- | -------------------------------------------------------------- |
| `src/fsm.ts`      | The FSM — parent intersection + child phase controller factory |
| `src/config.ts`   | Timing constants, signal state types, composite state lookup   |
| `src/renderer.ts` | Canvas 2D rendering — vehicles, pedestrians, signal housings   |
| `src/ui.ts`       | State panel, event log, button wiring                          |
| `src/main.ts`     | Wiring — connects FSM events to renderer and UI                |
