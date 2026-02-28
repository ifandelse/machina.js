// =============================================================================
// Checkout Flow — testing hierarchical FSMs with machina-test
//
// machina-test's reachability matchers (toAlwaysReach, toNeverReach) operate
// on the TOP-LEVEL state graph only. They do not traverse into _child FSMs.
// This is intentional — it avoids ambiguity around composite state names,
// duplicate state names across parent/child, and the question of "what does
// reachability mean across a delegation boundary?"
//
// The pattern: test parent and child independently.
//   - Pass the parent instance to expect() for parent-level assertions
//   - Pass the child instance to expect() for child-level assertions
//
// The ONE exception: toHaveNoUnreachableStates DOES recurse into children,
// because it delegates to machina-inspect's inspectGraph() which walks the
// full graph tree. An orphaned state in a child will surface as a finding
// at the parent level.
// =============================================================================

import "machina-test";
import { createPaymentFsm, createCheckoutFlow } from "./checkout-flow";

describe("Checkout Flow — hierarchical FSM testing", () => {
    // -------------------------------------------------------------------------
    // Testing the parent FSM
    //
    // When you pass the parent to expect(), the matchers only see the parent's
    // states: browsing, checkout, confirmation. The child's internal states
    // (entering-details, processing, authorized, declined) are invisible.
    // -------------------------------------------------------------------------

    describe("parent FSM (top-level graph only)", () => {
        let payment: ReturnType<typeof createPaymentFsm>;
        let checkout: ReturnType<typeof createCheckoutFlow>;

        beforeEach(() => {
            payment = createPaymentFsm();
            checkout = createCheckoutFlow(payment);
        });

        it("has no unreachable states at the parent level", () => {
            expect(checkout).toHaveNoUnreachableStates();
        });

        it("can reach confirmation from browsing", () => {
            expect(checkout).toAlwaysReach("confirmation", { from: "browsing" });
        });

        it("can abandon checkout and return to browsing", () => {
            expect(checkout).toAlwaysReach("browsing", { from: "checkout" });
        });

        it("can start a new order from confirmation", () => {
            expect(checkout).toAlwaysReach("browsing", { from: "confirmation" });
        });
    });

    // -------------------------------------------------------------------------
    // Testing the child FSM independently
    //
    // This is the key pattern. Create the child instance and pass it directly
    // to expect(). Now the matchers see entering-details, processing,
    // authorized, declined — the child's own graph.
    //
    // Don't try to reach into the parent's _child. Test the child on its own.
    // -------------------------------------------------------------------------

    describe("child FSM (payment, tested independently)", () => {
        let payment: ReturnType<typeof createPaymentFsm>;

        beforeEach(() => {
            payment = createPaymentFsm();
        });

        it("has no unreachable states", () => {
            expect(payment).toHaveNoUnreachableStates();
        });

        it("can reach authorized from entering-details (success path)", () => {
            expect(payment).toAlwaysReach("authorized", { from: "entering-details" });
        });

        it("can reach declined from entering-details (failure path)", () => {
            expect(payment).toAlwaysReach("declined", { from: "entering-details" });
        });

        it("can recover from declined back to entering-details (retry loop)", () => {
            expect(payment).toAlwaysReach("entering-details", { from: "declined" });
        });

        it("cannot escape authorized (terminal within the child)", () => {
            // Once payment is authorized, the child has no outbound transitions.
            // The parent handles what happens next via the "order-placed" input.
            expect(payment).toNeverReach("entering-details", { from: "authorized" });
            expect(payment).toNeverReach("declined", { from: "authorized" });
        });

        it("can eventually reach authorized even after a decline (retry path)", () => {
            // declined → entering-details → processing → authorized
            expect(payment).toAlwaysReach("authorized", { from: "declined" });
        });
    });

    // -------------------------------------------------------------------------
    // toHaveNoUnreachableStates and child FSMs
    //
    // This is the one matcher that sees through the hierarchy. It uses
    // machina-inspect's inspectGraph(), which recurses into _child graphs.
    // If a child has an orphaned state, it shows up as a failure on the parent.
    // -------------------------------------------------------------------------

    describe("toHaveNoUnreachableStates with child FSMs", () => {
        it("validates both parent and child graphs in a single assertion", () => {
            // This single call checks:
            //   - Parent: browsing, checkout, confirmation (all reachable)
            //   - Child:  entering-details, processing, authorized, declined (all reachable)
            const payment = createPaymentFsm();
            const checkout = createCheckoutFlow(payment);
            expect(checkout).toHaveNoUnreachableStates();
        });
    });

    // -------------------------------------------------------------------------
    // Why test parent and child separately?
    //
    // Consider this: the parent has a state called "checkout" and the child
    // has a state called "processing". If matchers traversed into children,
    // what would toAlwaysReach("processing", { from: "browsing" }) mean?
    //
    //   - "Can the parent reach a state called 'processing'?" (No — it doesn't
    //     have one. But the child does. Confusing.)
    //   - "Can browsing eventually lead to the child's processing state?" (Maybe,
    //     but that's a composite-state question, not a graph-topology question.)
    //
    // By keeping matchers top-level-only, the answer is always unambiguous:
    // you're asking about the states in the graph you passed to expect().
    // -------------------------------------------------------------------------
});
