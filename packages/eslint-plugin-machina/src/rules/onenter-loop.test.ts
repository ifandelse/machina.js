export default {};

import { RuleTester } from "eslint";
import rule from "./onenter-loop";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022 } });

tester.run("machina/onenter-loop", rule, {
    valid: [
        // No _onEnter handlers — no loop possible
        {
            code: `createFsm({ id: "simple", initialState: "idle", states: { idle: { start: "running" }, running: { stop: "idle" } } })`,
        },
        // _onEnter chain A→B with no cycle
        {
            code: `createFsm({ id: "chain", initialState: "a", states: { a: { _onEnter: () => "b" }, b: {} } })`,
        },
        // Non-createFsm call — not checked
        {
            code: `somethingElse({ id: "x", initialState: "a", states: { a: { _onEnter: () => "a" } } })`,
        },
        // Unresolvable config reference — silently skipped
        {
            code: `createFsm(dynamicConfig)`,
        },
        // Non-identifier callee (member expression) — should not be checked
        {
            code: `lib.createFsm({ id: "x", initialState: "a", states: { a: { _onEnter: () => "a" } } })`,
        },
        // No FSM calls at all — no errors
        {
            code: `const x = "hello";`,
        },
        // _onEnter with conditional return — not a definite loop
        {
            code: `createFsm({ id: "cond", initialState: "a", states: { a: { _onEnter: function(ctx) { if (ctx.x) return "b"; } }, b: { _onEnter: () => "a" } } })`,
        },
    ],
    invalid: [
        // A→B→A unconditional _onEnter loop
        {
            code: `createFsm({ id: "bouncy", initialState: "a", states: { a: { _onEnter: () => "b" }, b: { _onEnter: () => "a" } } })`,
            errors: [{ messageId: "onenter-loop" }],
        },
        // createBehavioralFsm also detected
        {
            code: `createBehavioralFsm({ id: "behavioral-bouncy", initialState: "x", states: { x: { _onEnter: () => "y" }, y: { _onEnter: () => "x" } } })`,
            errors: [{ messageId: "onenter-loop" }],
        },
    ],
});
