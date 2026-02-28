export default {};

// Register custom matchers before any assertions run
import "./index";

import { createFsm, createBehavioralFsm } from "machina";

// =============================================================================
// FSM fixtures used across test suites
//
// Traffic light: green → yellow → red → green (all reachable, cyclic)
// Broken light:  green → yellow, red is isolated (unreachable state)
// One-way door:  open → locked, no path back (toNeverReach scenario)
// =============================================================================

const makeTrafficLight = () =>
    createFsm({
        id: "traffic-light",
        initialState: "green",
        context: {},
        states: {
            green: { timeout: "yellow" },
            yellow: { timeout: "red" },
            red: { timeout: "green" },
        },
    });

const makeBrokenLight = () =>
    createFsm({
        id: "broken-light",
        initialState: "green",
        context: {},
        states: {
            green: { timeout: "yellow" },
            yellow: {},
            // red is defined but never transitioned to — unreachable
            red: { timeout: "green" },
        },
    });

const makeOneWayDoor = () =>
    createFsm({
        id: "one-way-door",
        initialState: "open",
        context: {},
        states: {
            open: { lock: "locked" },
            locked: {},
        },
    });

const makeBehavioralTrafficLight = () =>
    createBehavioralFsm({
        id: "behavioral-traffic-light",
        initialState: "green",
        states: {
            green: { timeout: "yellow" },
            yellow: { timeout: "red" },
            red: { timeout: "green" },
        },
    });

const makeBehavioralBrokenLight = () =>
    createBehavioralFsm({
        id: "behavioral-broken-light",
        initialState: "green",
        states: {
            green: { timeout: "yellow" },
            yellow: {},
            red: { timeout: "green" },
        },
    });

// A FSM with a child that has an unreachable state
const makeParentWithUnreachableChild = () => {
    const childFsm = createFsm({
        id: "child-fsm",
        initialState: "alpha",
        context: {},
        states: {
            alpha: { next: "beta" },
            beta: {},
            // orphan is unreachable inside the child
            orphan: {},
        },
    });

    return createFsm({
        id: "parent-fsm",
        initialState: "active",
        context: {},
        states: {
            active: {
                _child: childFsm,
                done: "idle",
            },
            idle: {},
        },
    });
};

// =============================================================================
// toHaveNoUnreachableStates
// =============================================================================

describe("toHaveNoUnreachableStates", () => {
    describe("when all states are reachable from initialState", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;

        beforeEach(() => {
            fsm = makeTrafficLight();
        });

        it("should pass", () => {
            expect(fsm).toHaveNoUnreachableStates();
        });
    });

    describe("when one or more states are unreachable", () => {
        let fsm: ReturnType<typeof makeBrokenLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeBrokenLight();
            caughtError = undefined;
            try {
                expect(fsm).toHaveNoUnreachableStates();
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should include the unreachable state name in the failure message", () => {
            expect(caughtError!.message).toContain("'red'");
        });

        it("should include the FSM id in the failure message", () => {
            expect(caughtError!.message).toContain("broken-light");
        });
    });

    describe("when used with a createBehavioralFsm instance — all states reachable", () => {
        let bfsm: ReturnType<typeof makeBehavioralTrafficLight>;

        beforeEach(() => {
            bfsm = makeBehavioralTrafficLight();
        });

        it("should pass", () => {
            expect(bfsm).toHaveNoUnreachableStates();
        });
    });

    describe("when used with a createBehavioralFsm instance — unreachable state exists", () => {
        let bfsm: ReturnType<typeof makeBehavioralBrokenLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            bfsm = makeBehavioralBrokenLight();
            caughtError = undefined;
            try {
                expect(bfsm).toHaveNoUnreachableStates();
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should include the unreachable state name in the failure message", () => {
            expect(caughtError!.message).toContain("'red'");
        });
    });

    describe("when a child FSM has an unreachable state", () => {
        let fsm: ReturnType<typeof makeParentWithUnreachableChild>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeParentWithUnreachableChild();
            caughtError = undefined;
            try {
                expect(fsm).toHaveNoUnreachableStates();
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail and report the orphaned child state", () => {
            expect(caughtError).toBeDefined();
        });

        it("should include the orphaned state name in the failure message", () => {
            expect(caughtError!.message).toContain("'orphan'");
        });
    });

    describe("negated — .not.toHaveNoUnreachableStates when unreachable states exist", () => {
        let fsm: ReturnType<typeof makeBrokenLight>;

        beforeEach(() => {
            fsm = makeBrokenLight();
        });

        it("should pass", () => {
            expect(fsm).not.toHaveNoUnreachableStates();
        });
    });

    describe("negated — .not.toHaveNoUnreachableStates message when all states are reachable", () => {
        // This exercises the pass===true branch of message(), which is only
        // called when the negated form fails (all states reachable, .not used).
        let fsm: ReturnType<typeof makeTrafficLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeTrafficLight();
            caughtError = undefined;
            try {
                expect(fsm).not.toHaveNoUnreachableStates();
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should include the FSM id in the failure message", () => {
            expect(caughtError!.message).toContain("traffic-light");
        });

        it("should report that all states are reachable in the failure message", () => {
            expect(caughtError!.message).toContain("all states are reachable");
        });
    });

    describe("when the FSM has only one state (the initial state)", () => {
        // Single-state FSM — no edges at all, no unreachable states possible
        let fsm: ReturnType<typeof createFsm>;

        beforeEach(() => {
            fsm = createFsm({
                id: "single-state",
                initialState: "idle",
                context: {},
                states: {
                    idle: {},
                },
            });
        });

        it("should pass", () => {
            expect(fsm).toHaveNoUnreachableStates();
        });
    });
});

// =============================================================================
// toAlwaysReach
// =============================================================================

describe("toAlwaysReach", () => {
    describe("when a direct path exists between the two states", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;

        beforeEach(() => {
            fsm = makeTrafficLight();
        });

        it("should pass", () => {
            expect(fsm).toAlwaysReach("yellow", { from: "green" });
        });
    });

    describe("when a multi-hop path exists between the two states", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;

        beforeEach(() => {
            fsm = makeTrafficLight();
        });

        it("should pass for green → red (two hops)", () => {
            expect(fsm).toAlwaysReach("red", { from: "green" });
        });
    });

    describe("when no path exists between the two states", () => {
        let fsm: ReturnType<typeof makeOneWayDoor>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeOneWayDoor();
            caughtError = undefined;
            try {
                // No path from locked back to open
                expect(fsm).toAlwaysReach("open", { from: "locked" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should include both state names and the FSM id in the failure message", () => {
            expect(caughtError!.message).toContain("one-way-door");
            expect(caughtError!.message).toContain("'locked'");
            expect(caughtError!.message).toContain("'open'");
        });
    });

    describe("when the 'from' state does not exist in the FSM", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeTrafficLight();
            caughtError = undefined;
            try {
                expect(fsm).toAlwaysReach("yellow", { from: "purple" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail with a descriptive message", () => {
            expect(caughtError).toBeDefined();
            expect(caughtError!.message).toContain("'purple'");
            expect(caughtError!.message).toContain("traffic-light");
        });
    });

    describe("when the target state does not exist in the FSM", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeTrafficLight();
            caughtError = undefined;
            try {
                expect(fsm).toAlwaysReach("ultraviolet", { from: "green" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail with a descriptive message", () => {
            expect(caughtError).toBeDefined();
            expect(caughtError!.message).toContain("'ultraviolet'");
            expect(caughtError!.message).toContain("traffic-light");
        });
    });

    describe("when used with a createBehavioralFsm instance", () => {
        let bfsm: ReturnType<typeof makeBehavioralTrafficLight>;

        beforeEach(() => {
            bfsm = makeBehavioralTrafficLight();
        });

        it("should pass when path exists", () => {
            expect(bfsm).toAlwaysReach("red", { from: "green" });
        });
    });

    describe("negated — .not.toAlwaysReach when no path exists", () => {
        let fsm: ReturnType<typeof makeOneWayDoor>;

        beforeEach(() => {
            fsm = makeOneWayDoor();
        });

        it("should pass", () => {
            expect(fsm).not.toAlwaysReach("open", { from: "locked" });
        });
    });

    describe("negated — .not.toAlwaysReach message when a path does exist", () => {
        // Exercises the pass===true branch of message(), called only when
        // .not.toAlwaysReach fails (path exists but user expected no path)
        let fsm: ReturnType<typeof makeTrafficLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeTrafficLight();
            caughtError = undefined;
            try {
                expect(fsm).not.toAlwaysReach("yellow", { from: "green" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should report that a path exists in the failure message", () => {
            expect(caughtError!.message).toContain("but a path exists");
        });

        it("should include both state names and FSM id in the failure message", () => {
            expect(caughtError!.message).toContain("traffic-light");
            expect(caughtError!.message).toContain("'green'");
            expect(caughtError!.message).toContain("'yellow'");
        });
    });

    describe("when from and target are the same state", () => {
        // canReach returns true immediately via the early-return branch,
        // so toAlwaysReach should pass for from===to
        let fsm: ReturnType<typeof makeOneWayDoor>;

        beforeEach(() => {
            fsm = makeOneWayDoor();
        });

        it("should pass", () => {
            expect(fsm).toAlwaysReach("open", { from: "open" });
        });
    });

    describe("when the invalid 'from' state message includes available states", () => {
        // Validates the full invalidStateMessage format — the available-states
        // list should appear in the output
        let fsm: ReturnType<typeof makeTrafficLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeTrafficLight();
            caughtError = undefined;
            try {
                expect(fsm).toAlwaysReach("yellow", { from: "chartreuse" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should list available states in the failure message", () => {
            expect(caughtError!.message).toContain("Available states:");
            expect(caughtError!.message).toContain("green");
        });
    });
});

// =============================================================================
// toNeverReach
// =============================================================================

describe("toNeverReach", () => {
    describe("when no path exists between the two states", () => {
        let fsm: ReturnType<typeof makeOneWayDoor>;

        beforeEach(() => {
            fsm = makeOneWayDoor();
        });

        it("should pass", () => {
            expect(fsm).toNeverReach("open", { from: "locked" });
        });
    });

    describe("when a path does exist between the two states", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeTrafficLight();
            caughtError = undefined;
            try {
                expect(fsm).toNeverReach("yellow", { from: "green" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should include both state names and the FSM id in the failure message", () => {
            expect(caughtError!.message).toContain("traffic-light");
            expect(caughtError!.message).toContain("'green'");
            expect(caughtError!.message).toContain("'yellow'");
        });
    });

    describe("when the 'from' state does not exist in the FSM", () => {
        let fsm: ReturnType<typeof makeOneWayDoor>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeOneWayDoor();
            caughtError = undefined;
            try {
                expect(fsm).toNeverReach("open", { from: "interdimensional" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail with a descriptive message", () => {
            expect(caughtError).toBeDefined();
            expect(caughtError!.message).toContain("'interdimensional'");
            expect(caughtError!.message).toContain("one-way-door");
        });
    });

    describe("when the target state does not exist in the FSM", () => {
        let fsm: ReturnType<typeof makeOneWayDoor>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeOneWayDoor();
            caughtError = undefined;
            try {
                expect(fsm).toNeverReach("ajar", { from: "open" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail with a descriptive message", () => {
            expect(caughtError).toBeDefined();
            expect(caughtError!.message).toContain("'ajar'");
            expect(caughtError!.message).toContain("one-way-door");
        });
    });

    describe("when used with a createBehavioralFsm instance", () => {
        let bfsm: ReturnType<typeof makeBehavioralTrafficLight>;

        beforeEach(() => {
            bfsm = makeBehavioralTrafficLight();
        });

        it("should fail when a path exists (green can reach yellow)", () => {
            // toNeverReach passes when no path exists — here a path exists, so we
            // negate it to demonstrate the behavioral FSM is handled correctly
            expect(bfsm).not.toNeverReach("yellow", { from: "green" });
        });
    });

    describe("negated — .not.toNeverReach when a path does exist", () => {
        let fsm: ReturnType<typeof makeTrafficLight>;

        beforeEach(() => {
            fsm = makeTrafficLight();
        });

        it("should pass", () => {
            expect(fsm).not.toNeverReach("yellow", { from: "green" });
        });
    });

    describe("negated — .not.toNeverReach message when no path exists", () => {
        // Exercises the pass===true branch of toNeverReach message(), called
        // only when .not.toNeverReach fails (no path exists but user expected one)
        let fsm: ReturnType<typeof makeOneWayDoor>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeOneWayDoor();
            caughtError = undefined;
            try {
                expect(fsm).not.toNeverReach("open", { from: "locked" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail", () => {
            expect(caughtError).toBeDefined();
        });

        it("should report that no path exists in the failure message", () => {
            expect(caughtError!.message).toContain("but no path exists");
        });

        it("should include both state names and FSM id in the failure message", () => {
            expect(caughtError!.message).toContain("one-way-door");
            expect(caughtError!.message).toContain("'locked'");
            expect(caughtError!.message).toContain("'open'");
        });
    });

    describe("when from and target are the same state", () => {
        // canReach returns true for from===to, so toNeverReach should fail
        // (a state trivially reaches itself)
        let fsm: ReturnType<typeof makeOneWayDoor>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeOneWayDoor();
            caughtError = undefined;
            try {
                expect(fsm).toNeverReach("open", { from: "open" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should fail because a state trivially reaches itself", () => {
            expect(caughtError).toBeDefined();
        });
    });

    describe("when the invalid 'target' state message includes available states", () => {
        // Validates the full invalidStateMessage format for toNeverReach
        let fsm: ReturnType<typeof makeOneWayDoor>;
        let caughtError: Error | undefined;

        beforeEach(() => {
            fsm = makeOneWayDoor();
            caughtError = undefined;
            try {
                expect(fsm).toNeverReach("ajar", { from: "open" });
            } catch (err) {
                caughtError = err as Error;
            }
        });

        it("should list available states in the failure message", () => {
            expect(caughtError!.message).toContain("Available states:");
            expect(caughtError!.message).toContain("open");
        });
    });
});
