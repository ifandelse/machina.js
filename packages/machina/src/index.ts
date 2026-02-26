/**
 * machina v6 — finite state machine library
 *
 * Primary entry points:
 * - `createFsm()` — single-client FSM (context is owned by the FSM)
 * - `createBehavioralFsm()` — multi-client FSM (state tracked per client object)
 *
 * @module machina
 */

// Factory functions (primary API)
export { createFsm } from "./fsm";
export { createBehavioralFsm } from "./behavioral-fsm";

// Classes (for type annotations and advanced usage)
export { Fsm } from "./fsm";
export { BehavioralFsm } from "./behavioral-fsm";

// Types
export type { Subscription } from "./emitter";
export type {
    FsmConfig,
    FsmEventMap,
    BehavioralFsmEventMap,
    HandlerArgs,
    HandlerFn,
    HandlerDef,
    MachinaInstance,
    StateNamesOf,
    InputNamesOf,
    DisposeOptions,
    ChildLink,
} from "./types";

// Runtime values used by inspection tooling
export { MACHINA_TYPE } from "./types";
