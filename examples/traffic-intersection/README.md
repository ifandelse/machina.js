# Traffic Intersection

A canvas-rendered traffic intersection that demonstrates hierarchical FSMs in machina. The animation exists to make the state machines visible.

## What This Demonstrates

The example combines these machina features:

1. **`_child` delegation**: parent states forward inputs to an active child FSM automatically.
2. **Input bubbling**: the child fires `phaseComplete` at itself without handling it, and the input bubbles up to the parent. The child declares `bubbles: ["phaseComplete"]`, which types the self-dispatch and obliges any config that mounts the child to handle it.
3. **`compositeState()`**: returns `"northSouthPhase.green"`, the parent and child state combined into one readable string.
4. **Child auto-reset**: when the parent re-enters a phase state, machina calls `reset()` on the child automatically and returns it to `green`.
5. **`defer()`**: a pedestrian button press during the locked green is queued and replayed automatically when the FSM enters `interruptibleGreen`.

The [hierarchical guide](https://machina-js.org/guide/hierarchical/) and the [defer guide](https://machina-js.org/guide/defer/) cover these APIs in depth.

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

`nsPhaseCtrl` and `ewPhaseCtrl` come from the same factory, and each instance has its own context object and timers. They never share state.

## Signal State Mapping

`compositeState()` drives everything the renderer shows. The lookup table in [src/config.ts](./src/config.ts) maps each composite state string to visual signal states for all four directions:

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

The durations come from [src/config.ts](./src/config.ts):

| Phase               | Duration |
| ------------------- | -------- |
| Green (locked)      | 3s       |
| Interruptible green | 6s       |
| Yellow              | 2.5s     |
| All-red clearance   | 2.75s    |

## The Pedestrian Button

Pressing it during the locked green defers the request. `defer({ until: "interruptibleGreen" })` queues the input and replays it automatically when the FSM enters that state. The button press still registers, and it takes effect at the earliest safe moment.

During `interruptibleGreen`, whether from a live press or a deferred replay, the phase transitions immediately to yellow. During yellow, clearance, or ready, the input is unhandled and fires a `nohandler` event.

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

The tests use Jest fake timers and complete full signal cycles without real waiting. They cover the normal progression and the pedestrian defer and replay, plus child auto-reset across cycles and disposal.

## File Guide

| File                                 | What it does                                                            |
| ------------------------------------ | ----------------------------------------------------------------------- |
| [src/fsm.ts](./src/fsm.ts)           | The parent intersection FSM and the factory for child phase controllers |
| [src/config.ts](./src/config.ts)     | Timing constants, signal state types, and the composite-state lookup    |
| [src/renderer.ts](./src/renderer.ts) | Canvas 2D rendering of vehicles, pedestrians, and signal housings       |
| [src/ui.ts](./src/ui.ts)             | The state panel, event log, and button wiring                           |
| [src/main.ts](./src/main.ts)         | Connects FSM events to the renderer and the UI                          |
