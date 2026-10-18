# inspect-demo

A terminal demo of [machina-inspect](https://www.npmjs.com/package/machina-inspect). [demo.ts](./demo.ts) runs `inspect()` against FSM configs with intentional structural bugs and prints the findings for each one.

## Running

From this directory:

```sh
pnpm demo
```

## Sections

The demo prints its output in numbered sections:

1. A clean traffic-light config, with an empty findings array
2. An unreachable state, where `broken` has an outbound edge and lacks an inbound one
3. An unconditional `_onEnter` loop between two states
4. A conditional `_onEnter` bounce, which the loop check skips on purpose
5. Function handlers plus an unreachable state
6. A live `Fsm` instance passed to `inspect()`
7. A live `BehavioralFsm` instance
8. The graph IR from `buildStateGraph()`
9. A child FSM with an unreachable state

## Going deeper

The [machina-inspect README](../../packages/machina-inspect/README.md) documents the API, and the [machina-inspect tools page](https://machina-js.org/tools/machina-inspect/) covers the checks and the graph IR in detail.
