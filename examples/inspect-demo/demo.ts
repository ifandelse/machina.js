/**
 * machina-inspect demo — run with: pnpm tsx examples/inspect-demo.ts
 *
 * Exercises the inspect API against a handful of FSM configs,
 * including some with intentional structural bugs.
 */

import { createFsm, createBehavioralFsm } from "machina";
import { inspect, buildStateGraph } from "machina-inspect";

// ---------------------------------------------------------------------------
// 1. Clean config — should produce zero findings
// ---------------------------------------------------------------------------
const trafficLight = {
    id: "traffic-light",
    initialState: "green",
    states: {
        green: { timeout: "yellow" },
        yellow: { timeout: "red" },
        red: { timeout: "green" },
    },
};

console.log("=== 1. Clean config (traffic light) ===");
console.log("Findings:", inspect(trafficLight));
console.log();

// ---------------------------------------------------------------------------
// 2. Unreachable state — "broken" has no inbound transitions
// ---------------------------------------------------------------------------
const trafficLightWithDeadState = {
    id: "traffic-light-broken",
    initialState: "green",
    states: {
        green: { timeout: "yellow" },
        yellow: { timeout: "red" },
        red: { timeout: "green" },
        broken: { reset: "green" },
    },
};

console.log("=== 2. Unreachable state ===");
for (const f of inspect(trafficLightWithDeadState)) {
    console.log(`  [${f.type}] ${f.message}`);
}
console.log();

// ---------------------------------------------------------------------------
// 3. _onEnter loop — unconditional bounce cycle: A → B → A
// ---------------------------------------------------------------------------
const bouncingFsm = {
    id: "bouncer",
    initialState: "a",
    states: {
        a: {
            _onEnter: () => {
                return "b";
            },
            go: "b",
        },
        b: {
            _onEnter: () => {
                return "a";
            },
            go: "a",
        },
    },
};

console.log("=== 3. _onEnter loop (unconditional A ↔ B) ===");
for (const f of inspect(bouncingFsm)) {
    console.log(`  [${f.type}] ${f.message}`);
}
console.log();

// ---------------------------------------------------------------------------
// 4. Conditional _onEnter — NOT a bug (should produce zero loop findings)
// ---------------------------------------------------------------------------
const conditionalBounce = {
    id: "conditional-bounce",
    initialState: "idle",
    states: {
        idle: {
            start: "processing",
        },
        processing: {
            _onEnter: ({ ctx }: { ctx: { hasError: boolean } }) => {
                if (ctx.hasError) {
                    return "error";
                }
            },
            done: "complete",
        },
        error: {
            _onEnter: ({ ctx }: { ctx: { hasError: boolean } }) => {
                if (!ctx.hasError) {
                    return "processing";
                }
            },
            retry: "processing",
        },
        complete: {},
    },
};

console.log("=== 4. Conditional _onEnter (not a bug) ===");
const conditionalFindings = inspect(conditionalBounce);
console.log("Findings:", conditionalFindings.length === 0 ? "none (correct)" : conditionalFindings);
console.log();

// ---------------------------------------------------------------------------
// 5. Mix of function handlers with multiple return targets
// ---------------------------------------------------------------------------
const multiReturn = {
    id: "multi-return",
    initialState: "idle",
    states: {
        idle: {
            submit: ({ ctx }: { ctx: { valid: boolean } }) => {
                if (ctx.valid) {
                    return "processing";
                }
                return "validationError";
            },
        },
        processing: { complete: "done" },
        validationError: { fix: "idle" },
        done: {},
        orphan: { go: "idle" }, // unreachable
    },
};

console.log("=== 5. Function handlers + unreachable state ===");
for (const f of inspect(multiReturn)) {
    console.log(`  [${f.type}] ${f.message}`);
}
console.log();

// ---------------------------------------------------------------------------
// 6. Live Fsm instance (same analysis, different input path)
// ---------------------------------------------------------------------------
console.log("=== 6. Live Fsm instance ===");
const liveFsm = createFsm(trafficLightWithDeadState);
for (const f of inspect(liveFsm)) {
    console.log(`  [${f.type}] ${f.message}`);
}
console.log();

// ---------------------------------------------------------------------------
// 7. Live BehavioralFsm instance
// ---------------------------------------------------------------------------
console.log("=== 7. Live BehavioralFsm instance ===");
const liveBehavioral = createBehavioralFsm({
    id: "behavioral-demo",
    initialState: "ready",
    states: {
        ready: { go: "running" },
        running: { stop: "ready" },
        limbo: {}, // unreachable
    },
});
for (const f of inspect(liveBehavioral)) {
    console.log(`  [${f.type}] ${f.message}`);
}
console.log();

// ---------------------------------------------------------------------------
// 8. Graph IR — inspect the intermediate representation directly
// ---------------------------------------------------------------------------
console.log("=== 8. Graph IR (peek under the hood) ===");
const graph = buildStateGraph(multiReturn);
console.log(`FSM: ${graph.fsmId}`);
console.log(`Initial state: ${graph.initialState}`);
console.log(`States: ${Object.keys(graph.nodes).join(", ")}`);
for (const [name, node] of Object.entries(graph.nodes)) {
    if (node.edges.length > 0) {
        for (const e of node.edges) {
            console.log(`  ${name} --[${e.inputName}]--> ${e.to} (${e.confidence})`);
        }
    }
}
console.log();

// ---------------------------------------------------------------------------
// 9. Child FSM with its own structural issues
// ---------------------------------------------------------------------------
const childFsm = createFsm({
    id: "upload-child",
    initialState: "uploading",
    states: {
        uploading: { done: "complete" },
        complete: {},
        stale: {}, // unreachable in the child
    },
});

const parentWithChild = {
    id: "parent-fsm",
    initialState: "idle",
    states: {
        idle: { start: "active" },
        active: {
            _child: childFsm,
            finish: "idle",
        },
    },
};

console.log("=== 9. Child FSM with unreachable state ===");
for (const f of inspect(parentWithChild)) {
    console.log(
        `  [${f.type}] ${f.message}${f.parentState ? ` (parent state: ${f.parentState})` : ""}`
    );
}
console.log();

console.log("Done. 🎤⬇️");
