// =============================================================================
// Order Workflow — machina-test matcher examples
//
// Demonstrates all three matchers against a flat (non-hierarchical) FSM.
// This is the "getting started" file — if you're new to machina-test,
// read this first.
// =============================================================================

import "machina-test";
import { createOrderWorkflow } from "./order-workflow";

describe("Order Workflow", () => {
    let fsm: ReturnType<typeof createOrderWorkflow>;

    beforeEach(() => {
        fsm = createOrderWorkflow();
    });

    // -------------------------------------------------------------------------
    // toHaveNoUnreachableStates
    //
    // The simplest assertion: can every state be reached from initialState?
    // Catches orphaned states that snuck in during a refactor.
    // -------------------------------------------------------------------------

    describe("toHaveNoUnreachableStates", () => {
        it("all states are reachable from initialState", () => {
            expect(fsm).toHaveNoUnreachableStates();
        });
    });

    // -------------------------------------------------------------------------
    // toAlwaysReach
    //
    // "Does a path exist from A to B?" — graph topology, not runtime certainty.
    // A pass means the plumbing exists. Whether it flows at runtime depends on
    // which handlers fire, but the pipe is there.
    // -------------------------------------------------------------------------

    describe("toAlwaysReach", () => {
        it("can reach delivered from placed (the happy path)", () => {
            expect(fsm).toAlwaysReach("delivered", { from: "placed" });
        });

        it("can reach cancelled from validating (rejection path)", () => {
            expect(fsm).toAlwaysReach("cancelled", { from: "validating" });
        });

        it("can reach cancelled from processing (late cancellation)", () => {
            expect(fsm).toAlwaysReach("cancelled", { from: "processing" });
        });

        it("can reach refunded from placed (full lifecycle path exists)", () => {
            // placed → validating → processing → shipped → delivered → refunded
            expect(fsm).toAlwaysReach("refunded", { from: "placed" });
        });
    });

    // -------------------------------------------------------------------------
    // toNeverReach
    //
    // "Is B unreachable from A?" — useful for asserting terminal states stay
    // terminal, or that certain paths are structurally impossible.
    // -------------------------------------------------------------------------

    describe("toNeverReach", () => {
        it("cannot reach shipped once cancelled (terminal state)", () => {
            expect(fsm).toNeverReach("shipped", { from: "cancelled" });
        });

        it("cannot reach processing from delivered (no backtracking)", () => {
            expect(fsm).toNeverReach("processing", { from: "delivered" });
        });

        it("cannot go anywhere from refunded (also terminal)", () => {
            expect(fsm).toNeverReach("placed", { from: "refunded" });
        });
    });

    // -------------------------------------------------------------------------
    // .not variants
    //
    // Standard Jest negation works as expected. ".not.toAlwaysReach" passes
    // when no path exists; ".not.toNeverReach" passes when a path does exist.
    // -------------------------------------------------------------------------

    describe(".not variants", () => {
        it(".not.toAlwaysReach — confirms no path from cancelled to shipped", () => {
            expect(fsm).not.toAlwaysReach("shipped", { from: "cancelled" });
        });

        it(".not.toNeverReach — confirms a path does exist from placed to delivered", () => {
            expect(fsm).not.toNeverReach("delivered", { from: "placed" });
        });

        it(".not.toHaveNoUnreachableStates — would pass if unreachable states existed", () => {
            // This FSM has no unreachable states, so .not fails here.
            // Shown as a "this is how the API works" example — you'd use this
            // to assert that a deliberately orphaned state stays orphaned.
            expect(() => {
                expect(fsm).not.toHaveNoUnreachableStates();
            }).toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // Invalid state names
    //
    // Typos in state names produce clean test failures (not thrown exceptions).
    // The failure message lists available states so you can spot the typo.
    // -------------------------------------------------------------------------

    describe("invalid state names", () => {
        it("toAlwaysReach fails cleanly for a nonexistent target state", () => {
            expect(() => {
                expect(fsm).toAlwaysReach("shiped", { from: "placed" });
            }).toThrow(/State 'shiped' does not exist.*Available states/);
        });

        it("toNeverReach fails cleanly for a nonexistent source state", () => {
            expect(() => {
                expect(fsm).toNeverReach("shipped", { from: "cancled" });
            }).toThrow(/State 'cancled' does not exist.*Available states/);
        });
    });
});
