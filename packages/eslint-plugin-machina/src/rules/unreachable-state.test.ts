export default {};

import { RuleTester } from "eslint";
import rule from "./unreachable-state";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022 } });

tester.run("machina/unreachable-state", rule, {
    valid: [
        // All states reachable — no findings
        {
            code: `createFsm({ id: "traffic-light", initialState: "green", states: { green: { timeout: "yellow" }, yellow: { timeout: "red" }, red: { timeout: "green" } } })`,
        },
        // createBehavioralFsm — same rule applies
        {
            code: `createBehavioralFsm({ id: "conn", initialState: "offline", states: { offline: { connect: "online" }, online: { disconnect: "offline" } } })`,
        },
        // Non-createFsm call — should not be checked
        {
            code: `someOtherFn({ id: "x", initialState: "a", states: { a: {}, b: {} } })`,
        },
        // Unresolvable config reference — should silently skip
        {
            code: `createFsm(runtimeConfig)`,
        },
        // Non-identifier callee (member expression) — should not be checked
        {
            code: `machina.createFsm({ id: "x", initialState: "a", states: { a: {}, b: {} } })`,
        },
        // No FSM calls at all — no errors
        {
            code: `const x = 1 + 1;`,
        },
        // Multiple FSM calls in one file — both valid
        {
            code: `
                createFsm({ id: "fsm-a", initialState: "on", states: { on: { toggle: "off" }, off: { toggle: "on" } } });
                createFsm({ id: "fsm-b", initialState: "idle", states: { idle: { go: "active" }, active: { stop: "idle" } } });
            `,
        },
        // FSM call inside a function — still analyzed
        {
            code: `function setup() { createFsm({ id: "nested", initialState: "idle", states: { idle: { go: "active" }, active: { stop: "idle" } } }); }`,
        },
        // Parent FSM with an inline _child where all child states are reachable — no error expected
        {
            code: `createFsm({ id: "starship", initialState: "cruising", states: { cruising: { _child: createFsm({ id: "shields", initialState: "up", states: { up: { lower: "down" }, down: { raise: "up" } } }), warp: "warping" }, warping: { drop: "cruising" } } })`,
        },
    ],
    invalid: [
        // "abandoned" has no inbound path from "active"
        {
            code: `createFsm({ id: "broken", initialState: "active", states: { active: {}, abandoned: {} } })`,
            errors: [{ messageId: "unreachable-state" }],
        },
        // Multiple FSM calls in one file — second one has an unreachable state
        {
            code: `
                createFsm({ id: "ok-fsm", initialState: "on", states: { on: { toggle: "off" }, off: { toggle: "on" } } });
                createFsm({ id: "bad-fsm", initialState: "active", states: { active: {}, ghost: {} } });
            `,
            errors: [{ messageId: "unreachable-state" }],
        },
        // Parent has an inline _child whose states include an unreachable one.
        // Two errors are reported: once on the outer createFsm() (child graph walked)
        // and once on the inner createFsm() (rule visits both call expressions independently).
        {
            code: `createFsm({ id: "transporter", initialState: "ready", states: { ready: { _child: createFsm({ id: "buffer", initialState: "empty", states: { empty: { load: "loaded" }, loaded: {}, orphaned: {} } }) } } })`,
            errors: [{ messageId: "unreachable-state" }, { messageId: "unreachable-state" }],
        },
        // Parent FSM with an inline _child using createBehavioralFsm — the
        // createBehavioralFsm arm of isMachinaCall must fire for child resolution.
        // Two errors: outer createFsm() walk sees the orphaned child state,
        // inner createBehavioralFsm() is also visited independently.
        {
            code: `createFsm({ id: "ops", initialState: "active", states: { active: { _child: createBehavioralFsm({ id: "crew-task", initialState: "assigned", states: { assigned: { complete: "done" }, done: {}, abandoned: {} } }) } } })`,
            errors: [{ messageId: "unreachable-state" }, { messageId: "unreachable-state" }],
        },
    ],
});
