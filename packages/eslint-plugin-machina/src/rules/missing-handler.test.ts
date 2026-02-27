/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { RuleTester } from "eslint";
import rule from "./missing-handler";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022 } });

tester.run("machina/missing-handler", rule, {
    valid: [
        // All states handle the same inputs — symmetric FSM
        {
            code: `createFsm({ id: "light", initialState: "green", states: { green: { timeout: "yellow" }, yellow: { timeout: "red" }, red: { timeout: "green" } } })`,
        },
        // State has * catch-all — skipped entirely
        {
            code: `createFsm({ id: "wild", initialState: "idle", states: { idle: { start: "running" }, running: { "*": "idle" } } })`,
        },
        // Non-createFsm call — not checked
        {
            code: `thirdParty({ id: "t", initialState: "a", states: { a: { go: "b" }, b: {} } })`,
        },
        // Unresolvable config — silently skipped
        {
            code: `createFsm(externalConfig)`,
        },
        // Non-identifier callee (member expression) — should not be checked
        {
            code: `utils.createFsm({ id: "t", initialState: "a", states: { a: { go: "b" }, b: {} } })`,
        },
        // No FSM calls at all — no errors
        {
            code: `const answer = 42;`,
        },
        // createBehavioralFsm — symmetric states, valid
        {
            code: `createBehavioralFsm({ id: "bfsm", initialState: "idle", states: { idle: { ping: "active" }, active: { ping: "idle" } } })`,
        },
        // Single-state FSM — no comparison possible, no findings
        {
            code: `createFsm({ id: "solo", initialState: "alone", states: { alone: { ping: "alone" } } })`,
        },
    ],
    invalid: [
        // "running" handles "stop" but not "start"; "idle" handles "start" but not "stop"
        {
            code: `createFsm({ id: "asymmetric", initialState: "idle", states: { idle: { start: "running" }, running: { stop: "idle" } } })`,
            errors: [{ messageId: "missing-handler" }, { messageId: "missing-handler" }],
        },
        // createBehavioralFsm with asymmetric states — also detected
        {
            code: `createBehavioralFsm({ id: "behavioral-asymmetric", initialState: "idle", states: { idle: { connect: "active" }, active: { disconnect: "idle" } } })`,
            errors: [{ messageId: "missing-handler" }, { messageId: "missing-handler" }],
        },
    ],
});
