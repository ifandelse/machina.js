/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// walk.ts — Property-based walk testing for machina FSMs
//
// `walkAll` runs multiple randomized input sequences against a live FSM,
// asserting a user-supplied invariant after every transition. Deterministic
// replay is guaranteed via a seeded PRNG — on failure, the seed and full input
// sequence are included in the thrown WalkFailureError so you can reproduce
// the exact walk that uncovered the bug.
//
// Design choices:
//   - Factory function (not FSM instance) as first arg: each walk starts fresh
//   - Throws on failure, returns on success: natural test code, no result-type gymnastics
//   - step counts handle() calls, not transitions: maps 1:1 to input sequence index
//   - Inline mulberry32 PRNG: 5 lines, no dependency, deterministic across platforms
//   - Event-driven invariant: handles _onEnter bounces + deferred replays without
//     monkey-patching handle()
// =============================================================================

import { MACHINA_TYPE } from "machina";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments passed to the invariant callback after every transition.
 * Use these to assert that the FSM is in a valid state after each step.
 */
export interface InvariantArgs {
    /** State the FSM just transitioned TO */
    state: string;
    /** State the FSM transitioned FROM */
    previousState: string;
    /** Dot-delimited composite state (includes child states if any) */
    compositeState: string;
    /** The FSM context object (Fsm) or client object (BehavioralFsm) */
    ctx: unknown;
    /** The input name that triggered this transition */
    input: string;
    /** The payload passed to handle(), or undefined if no generator was configured */
    payload: unknown;
    /** Which handle() call produced this transition (1-indexed) */
    step: number;
}

/**
 * Returned by walkAll on success.
 */
export interface WalkResult {
    /** The seed used for this run — pass back to walkAll to replay */
    seed: number;
    /** How many walks completed without an invariant violation */
    walksCompleted: number;
}

/**
 * Configuration for a walkAll run.
 *
 * @typeParam TClient - The client object type for BehavioralFsm walks.
 *   Not relevant for Fsm walks — omit `client` in that case.
 */
export interface WalkConfig<TClient extends object = object> {
    /**
     * How many independent walks to run. Each walk creates a fresh FSM
     * via the factory and runs up to `maxSteps` random inputs.
     * Must be >= 1. Default: 100.
     */
    walks?: number;

    /**
     * Maximum number of handle() calls per walk.
     * Must be >= 1. Default: 50.
     */
    maxSteps?: number;

    /**
     * Seed for the PRNG. Providing the same seed guarantees the identical
     * input sequence — use the seed from WalkResult or WalkFailureError to
     * replay a specific walk. Defaults to a random integer.
     */
    seed?: number;

    /**
     * Whitelist of input names to use. Mutually exclusive with `exclude`.
     * If provided, only these inputs will be fired during walks.
     */
    include?: string[];

    /**
     * Blacklist of input names to exclude. Mutually exclusive with `include`.
     * These inputs are removed from the auto-extracted set before walking.
     */
    exclude?: string[];

    /**
     * Payload generators keyed by input name. When walkAll fires input "X"
     * and `inputs["X"]` is defined, it calls that function and passes the
     * return value as the payload to handle(). Inputs without generators
     * are fired with no payload.
     */
    inputs?: Record<string, () => unknown>;

    /**
     * BehavioralFsm client factory. Required when the FSM produced by the
     * factory is a BehavioralFsm — each walk calls this to get a fresh client.
     * Omit for Fsm walks.
     */
    client?: () => TClient;

    /**
     * Called after every transition. Return `false` OR throw to signal a
     * violation — WalkFailureError is constructed automatically in both cases.
     * Return `true` or `undefined` (void) to indicate the invariant passed.
     */
    invariant: (args: InvariantArgs) => boolean | void;
}

/** A recorded step in the input sequence — used for replay and error reporting */
interface InputRecord {
    input: string;
    payload: unknown;
}

/**
 * Thrown when walkAll detects an invariant violation. Carries the seed and
 * full input sequence so you can replay the exact walk that failed.
 */
export class WalkFailureError extends Error {
    /** Seed that produced this walk — pass to walkAll({ seed }) to replay */
    readonly seed: number;
    /** Which step (1-indexed handle() call) caused the violation */
    readonly step: number;
    /** The inputs fired up to and including the failing step */
    readonly inputSequence: InputRecord[];
    /** State at the time of violation */
    readonly state: string;
    /** State before the violating transition */
    readonly previousState: string;
    /** Composite state at the time of violation */
    readonly compositeState: string;
    /** The FSM context or client at the time of violation */
    readonly ctx: unknown;

    constructor(args: {
        seed: number;
        step: number;
        inputSequence: InputRecord[];
        state: string;
        previousState: string;
        compositeState: string;
        ctx: unknown;
        cause: unknown;
    }) {
        const causeMessage = args.cause instanceof Error ? args.cause.message : String(args.cause);
        const sequenceSummary = args.inputSequence
            .map((r, i) => `  ${i + 1}. ${r.input}`)
            .join("\n");

        super(
            `walkAll invariant violation at step ${args.step} (seed: ${args.seed})\n` +
                `  State: ${args.previousState} → ${args.state}\n` +
                `  Composite: ${args.compositeState}\n` +
                `  Cause: ${causeMessage}\n` +
                `Input sequence:\n${sequenceSummary}`
        );
        this.name = "WalkFailureError";
        this.seed = args.seed;
        this.step = args.step;
        this.inputSequence = args.inputSequence;
        this.state = args.state;
        this.previousState = args.previousState;
        this.compositeState = args.compositeState;
        this.ctx = args.ctx;
    }
}

// -----------------------------------------------------------------------------
// Seeded PRNG — mulberry32
//
// Passes BigCrush and PractRand. 5 lines, no external dependency.
// Returns floats in [0, 1) just like Math.random(), enabling drop-in
// deterministic replacement wherever we'd otherwise use Math.random().
// -----------------------------------------------------------------------------

/**
 * Creates a seeded PRNG using mulberry32.
 * Returns a function that yields deterministic floats in [0, 1).
 * Two PRNGs with the same seed produce identical sequences.
 */
export const createPrng = (seed: number): (() => number) => {
    let s = seed;
    return () => {
        s += 0x6d2b79f5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/**
 * Pick a random integer in [0, max) using the given PRNG.
 * Used to select a random index from the inputs array each step.
 */
export const randomInt = (prng: () => number, max: number): number => {
    return Math.floor(prng() * max);
};

// -----------------------------------------------------------------------------
// Keys that are lifecycle hooks or special directives, not named inputs.
// Mirrors SpecialStateKeys from machina core types.
// -----------------------------------------------------------------------------

const RESERVED_KEYS = new Set(["_onEnter", "_onExit", "_child", "*"]);

/**
 * Extract all distinct input names from an FSM's states object.
 * Skips reserved keys (_onEnter, _onExit, _child, *) — these are lifecycle
 * hooks and catch-alls, not named inputs you'd fire via handle().
 */
export const extractInputs = (fsm: {
    states: Record<string, Record<string, unknown>>;
}): string[] => {
    const inputs = new Set<string>();
    for (const stateObj of Object.values(fsm.states)) {
        for (const key of Object.keys(stateObj)) {
            if (!RESERVED_KEYS.has(key)) {
                inputs.add(key);
            }
        }
    }
    return Array.from(inputs);
};

// -----------------------------------------------------------------------------
// Config validation
// -----------------------------------------------------------------------------

const validateConfig = (config: WalkConfig, availableInputs: string[]): string[] => {
    const walks = config.walks ?? 100;
    const maxSteps = config.maxSteps ?? 50;

    if (walks < 1) {
        throw new Error(`walkAll: walks must be >= 1, got ${walks}`);
    }

    if (maxSteps < 1) {
        throw new Error(`walkAll: maxSteps must be >= 1, got ${maxSteps}`);
    }

    if (config.include && config.exclude) {
        throw new Error(
            "walkAll: include and exclude are mutually exclusive — use one or the other"
        );
    }

    let inputs: string[];

    if (config.include) {
        // Catch typos and misconfigurations before walking — an include entry
        // that doesn't exist in the FSM is almost certainly a bug at the call site.
        const knownInputs = new Set(availableInputs);
        const unknown = config.include.filter(name => !knownInputs.has(name));
        if (unknown.length > 0) {
            throw new Error(
                `walkAll: include contains inputs not found in the FSM: ${unknown.join(", ")}`
            );
        }
        inputs = config.include;
    } else if (config.exclude) {
        const excluded = new Set(config.exclude);
        inputs = availableInputs.filter(k => !excluded.has(k));
    } else {
        inputs = availableInputs;
    }

    if (inputs.length === 0) {
        throw new Error(
            "walkAll: no inputs available after filtering — check include/exclude config"
        );
    }

    return inputs;
};

// -----------------------------------------------------------------------------
// Walk engine
// -----------------------------------------------------------------------------

/**
 * Run property-based walk tests against a live FSM.
 *
 * Throws WalkFailureError on invariant violation. Returns WalkResult on success.
 *
 * @param factory - Called once per walk to create a fresh FSM instance.
 *   Each walk gets its own FSM so context mutations don't bleed between walks.
 * @param config - Walk configuration: invariant, walk count, step limit, seed,
 *   input filters, payload generators, and optional client factory.
 */
export const walkAll = <TClient extends object = object>(
    factory: () => any,
    config: WalkConfig<TClient>
): WalkResult => {
    const walks = config.walks ?? 100;
    const maxSteps = config.maxSteps ?? 50;

    // Build the input list from the first FSM instance — we only need this
    // for validation, not for actual walking (each walk creates its own FSM).
    const probeFsm = factory();
    const allInputs = extractInputs(probeFsm);
    const inputs = validateConfig(config, allInputs);

    // Dispose the probe FSM if possible — it was only needed for input extraction.
    if (typeof probeFsm.dispose === "function") {
        probeFsm.dispose();
    }

    const seed = config.seed ?? Math.floor(Math.random() * 2 ** 32);
    const prng = createPrng(seed);

    for (let walkIndex = 0; walkIndex < walks; walkIndex++) {
        runSingleWalk(factory, config, inputs, prng, seed, maxSteps);
    }

    return { seed, walksCompleted: walks };
};

/**
 * Run one walk: create a fresh FSM, subscribe to events, fire random inputs,
 * check invariant after every transition. Throws WalkFailureError on violation.
 */
const runSingleWalk = <TClient extends object>(
    factory: () => any,
    config: WalkConfig<TClient>,
    inputs: string[],
    prng: () => number,
    seed: number,
    maxSteps: number
): void => {
    const fsm = factory();
    const isBehavioral = fsm[MACHINA_TYPE] === "BehavioralFsm";

    // For BehavioralFsm: create a client and track it separately.
    // For Fsm: the client IS the fsm (context lives on the fsm).
    const client: TClient | undefined = isBehavioral
        ? config.client
            ? config.client()
            : ({} as TClient)
        : undefined;

    // Initialize BehavioralFsm client by transitioning into initialState.
    // Fsm eagerly initializes in its constructor — no action needed.
    if (isBehavioral && client !== undefined) {
        fsm.transition(client, fsm.initialState);
    }

    const inputSequence: InputRecord[] = [];
    let currentStep = 0;
    let currentInput = "";
    let violation: unknown = null;
    let violationArgs: InvariantArgs | null = null;

    // Track "current input" via the handling event, which fires before dispatch.
    // This is the input that caused any subsequent transitioned events — including
    // those from _onEnter bounces, where handling does NOT re-fire.
    // Both Fsm and BehavioralFsm expose inputName on this event, so no branching needed.
    const handlingSub = fsm.on("handling", (data: any) => {
        currentInput = data.inputName;
    });

    // The transitioned event fires after every state change, including _onEnter
    // bounces. We run the invariant here so we catch all transition types.
    const transitionedSub = isBehavioral
        ? fsm.on("transitioned", (data: any) => {
              if (violation !== null) {
                  return;
              }
              const ctx = data.client ?? client;
              const composite = fsm.compositeState(data.client ?? client);
              const record = inputSequence[inputSequence.length - 1];
              const args: InvariantArgs = {
                  state: data.toState,
                  previousState: data.fromState,
                  compositeState: composite,
                  ctx,
                  input: currentInput,
                  payload: record?.payload,
                  step: currentStep,
              };
              try {
                  const result = config.invariant(args);
                  // Returning false is an explicit violation signal (same as throwing).
                  // undefined/void and true both mean "invariant holds".
                  if (result === false) {
                      violation = new Error("invariant returned false");
                      violationArgs = args;
                  }
              } catch (err) {
                  violation = err;
                  violationArgs = args;
              }
          })
        : fsm.on("transitioned", (data: any) => {
              if (violation !== null) {
                  return;
              }
              // For Fsm, read context from fsm.context (Task 1 made this public)
              const ctx = fsm.context;
              const composite = fsm.compositeState();
              const record = inputSequence[inputSequence.length - 1];
              const args: InvariantArgs = {
                  state: data.toState,
                  previousState: data.fromState,
                  compositeState: composite,
                  ctx,
                  input: currentInput,
                  payload: record?.payload,
                  step: currentStep,
              };
              try {
                  const result = config.invariant(args);
                  // Returning false is an explicit violation signal (same as throwing).
                  // undefined/void and true both mean "invariant holds".
                  if (result === false) {
                      violation = new Error("invariant returned false");
                      violationArgs = args;
                  }
              } catch (err) {
                  violation = err;
                  violationArgs = args;
              }
          });

    try {
        for (let step = 1; step <= maxSteps; step++) {
            currentStep = step;
            const inputName = inputs[randomInt(prng, inputs.length)];
            const payload = config.inputs?.[inputName]?.();
            inputSequence.push({ input: inputName, payload });

            // Only spread the payload arg when a generator produced one — handlers
            // with no generator shouldn't receive a spurious undefined argument,
            // which could mask bugs in handlers that check arguments.length.
            const extraArgs = payload !== undefined ? [payload] : [];
            if (isBehavioral && client !== undefined) {
                fsm.handle(client, inputName, ...extraArgs);
            } else {
                fsm.handle(inputName, ...extraArgs);
            }

            if (violation !== null) {
                throw new WalkFailureError({
                    seed,
                    step,
                    inputSequence: [...inputSequence],
                    state: violationArgs!.state,
                    previousState: violationArgs!.previousState,
                    compositeState: violationArgs!.compositeState,
                    ctx: violationArgs!.ctx,
                    cause: violation,
                });
            }
        }
    } finally {
        // Always unsubscribe, even on failure — prevents listener leaks between walks
        handlingSub.off();
        transitionedSub.off();

        if (typeof fsm.dispose === "function") {
            fsm.dispose();
        }
    }
};
