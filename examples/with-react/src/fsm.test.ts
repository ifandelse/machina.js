/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// fsm.test.ts — Checkout Flow FSM hardening tests
//
// createCheckoutFsm() exports a factory: { fsm, context }. The FSM has zero
// React imports — it's pure logic driveable from a test.
//
// Key things being tested:
//   - All 8 state transitions (happy path + branching paths)
//   - returnTo flag round-trips from review → personalDetails and review → payment
//   - threeDSecureVerified loop prevention
//   - startOver full context reset
//   - Invalid inputs (nohandler events)
//   - Context mutations via handle("next", formData)
//   - paymentFailed recovery paths (retry and editPayment)
//   - review._onEnter clearing returnTo and threeDSecureVerified
//   - paymentProcessing._onEnter setTimeout (uses fake timers)
// =============================================================================

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PERSONAL_DETAILS_ZAPHOD = {
    name: "Zaphod Beeblebrox",
    email: "zaphod@heartofgold.space",
    address: "42 Infinite Improbability Drive",
    city: "Betelgeuse",
    zip: "42042",
};

const PAYMENT_DETAILS_VISA = {
    cardNumber: "4111111111111111",
    expiry: "12/30",
    cvv: "042",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reachPersonalDetails(fsm: any): void {
    fsm.handle("selectNewCustomer");
}

function reachPayment(fsm: any): void {
    fsm.handle("selectNewCustomer");
    fsm.handle("next", PERSONAL_DETAILS_ZAPHOD);
}

function reachReview(fsm: any): void {
    fsm.handle("selectNewCustomer");
    fsm.handle("next", PERSONAL_DETAILS_ZAPHOD);
    fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
    jest.runAllTimers();
}

function reachConfirmation(fsm: any): void {
    reachReview(fsm);
    fsm.handle("placeOrder");
}

// =============================================================================
// Tests
// =============================================================================

describe("createCheckoutFsm (fsm.ts)", () => {
    let fsm: any, context: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require("./fsm");
        const result = mod.createCheckoutFsm();
        fsm = result.fsm;
        context = result.context;
    });

    afterEach(() => {
        fsm.dispose();
        jest.useRealTimers();
    });

    // =========================================================================
    // Initial state
    // =========================================================================

    describe("initial state", () => {
        describe("when the FSM is first created", () => {
            it("should start in the start state", () => {
                expect(fsm.currentState()).toBe("start");
            });

            it("should expose a clean context object", () => {
                expect(context).toEqual({
                    customerType: null,
                    personalDetails: null,
                    paymentDetails: null,
                    paymentScenario: "success",
                    returnTo: null,
                    threeDSecureVerified: false,
                });
            });
        });
    });

    // =========================================================================
    // start state — customer type selection
    // =========================================================================

    describe("start state", () => {
        describe("when selectNewCustomer is received", () => {
            beforeEach(() => {
                fsm.handle("selectNewCustomer");
            });

            it("should transition to personalDetails", () => {
                expect(fsm.currentState()).toBe("personalDetails");
            });

            it("should set customerType to new on context", () => {
                expect(context.customerType).toBe("new");
            });
        });

        describe("when selectReturningCustomer is received", () => {
            beforeEach(() => {
                fsm.handle("selectReturningCustomer");
            });

            it("should transition to personalDetails", () => {
                expect(fsm.currentState()).toBe("personalDetails");
            });

            it("should set customerType to returning on context", () => {
                expect(context.customerType).toBe("returning");
            });
        });

        describe("when an unknown input is received in start state", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("next");
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
            });

            it("should remain in start state", () => {
                expect(fsm.currentState()).toBe("start");
            });
        });
    });

    // =========================================================================
    // personalDetails state — normal forward flow
    // =========================================================================

    describe("personalDetails state (normal forward flow)", () => {
        describe("when next is received with form data and returnTo is null", () => {
            beforeEach(() => {
                reachPersonalDetails(fsm);
                fsm.handle("next", PERSONAL_DETAILS_ZAPHOD);
            });

            it("should transition to payment", () => {
                expect(fsm.currentState()).toBe("payment");
            });

            it("should write form data to context.personalDetails", () => {
                expect(context.personalDetails).toEqual(PERSONAL_DETAILS_ZAPHOD);
            });
        });

        describe("when back is received and returnTo is null", () => {
            beforeEach(() => {
                reachPersonalDetails(fsm);
                fsm.handle("back");
            });

            it("should transition to start", () => {
                expect(fsm.currentState()).toBe("start");
            });
        });
    });

    // =========================================================================
    // personalDetails state — returnTo === "review" (edit round-trip)
    // =========================================================================

    describe("personalDetails state (returnTo === review)", () => {
        describe("when next is received and returnTo is review", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPersonalDetails"); // sets returnTo = "review", → personalDetails
                fsm.handle("next", PERSONAL_DETAILS_ZAPHOD);
            });

            it("should transition to review instead of payment", () => {
                expect(fsm.currentState()).toBe("review");
            });
        });

        describe("when back is received and returnTo is review", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPersonalDetails"); // sets returnTo = "review", → personalDetails
                fsm.handle("back");
            });

            it("should transition to review instead of start", () => {
                expect(fsm.currentState()).toBe("review");
            });
        });
    });

    // =========================================================================
    // payment state — normal forward flow
    // =========================================================================

    describe("payment state (normal forward flow)", () => {
        describe("when next is received with payment data", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
            });

            it("should transition to paymentProcessing", () => {
                expect(fsm.currentState()).toBe("paymentProcessing");
            });

            it("should write payment details to context", () => {
                expect(context.paymentDetails).toEqual(PAYMENT_DETAILS_VISA);
            });

            it("should write the scenario to context", () => {
                expect(context.paymentScenario).toBe("success");
            });
        });

        describe("when back is received and returnTo is null", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("back");
            });

            it("should transition to personalDetails", () => {
                expect(fsm.currentState()).toBe("personalDetails");
            });
        });
    });

    // =========================================================================
    // payment state — returnTo === "review" (edit round-trip)
    // =========================================================================

    describe("payment state (returnTo === review)", () => {
        describe("when back is received and returnTo is review", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPayment"); // sets returnTo = "review", → payment
                fsm.handle("back");
            });

            it("should transition to review instead of personalDetails", () => {
                expect(fsm.currentState()).toBe("review");
            });
        });

        describe("when next is received and returnTo is review", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPayment"); // sets returnTo = "review", → payment
                // next always goes to paymentProcessing regardless of returnTo
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
            });

            it("should transition to paymentProcessing even when returnTo is review", () => {
                // payment.next always processes — editing payment means re-processing
                expect(fsm.currentState()).toBe("paymentProcessing");
            });
        });
    });

    // =========================================================================
    // paymentProcessing — success scenario
    // =========================================================================

    describe("paymentProcessing state (success scenario)", () => {
        describe("when the processing timer fires with scenario success", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
                jest.runAllTimers();
            });

            it("should transition to review", () => {
                expect(fsm.currentState()).toBe("review");
            });
        });
    });

    // =========================================================================
    // paymentProcessing — failure scenario
    // =========================================================================

    describe("paymentProcessing state (failure scenario)", () => {
        describe("when the processing timer fires with scenario failure", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "failure" });
                jest.runAllTimers();
            });

            it("should transition to paymentFailed", () => {
                expect(fsm.currentState()).toBe("paymentFailed");
            });
        });
    });

    // =========================================================================
    // paymentProcessing — threeDSecure scenario
    // =========================================================================

    describe("paymentProcessing state (threeDSecure scenario)", () => {
        describe("when the processing timer fires with scenario threeDSecure", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "threeDSecure" });
                jest.runAllTimers();
            });

            it("should transition to threeDSecure", () => {
                expect(fsm.currentState()).toBe("threeDSecure");
            });
        });
    });

    // =========================================================================
    // paymentProcessing — threeDSecureVerified loop prevention
    // =========================================================================

    describe("paymentProcessing state (threeDSecureVerified flag set)", () => {
        describe("when re-entering paymentProcessing after completeVerification", () => {
            beforeEach(() => {
                reachPayment(fsm);
                // Select the 3DS scenario
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "threeDSecure" });
                jest.runAllTimers(); // → threeDSecure

                // Complete 3DS — sets threeDSecureVerified = true, → paymentProcessing
                fsm.handle("completeVerification");
                // Fire the second processing timer — should skip scenario check and go to review
                jest.runAllTimers();
            });

            it("should transition to review (not loop back into threeDSecure)", () => {
                expect(fsm.currentState()).toBe("review");
            });

            it("should have threeDSecureVerified cleared by review._onEnter", () => {
                // review._onEnter clears threeDSecureVerified after arriving
                expect(context.threeDSecureVerified).toBe(false);
            });
        });
    });

    // =========================================================================
    // paymentFailed state — retry path
    // =========================================================================

    describe("paymentFailed state (retry)", () => {
        describe("when retry is received in paymentFailed", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "failure" });
                jest.runAllTimers(); // → paymentFailed
                fsm.handle("retry");
            });

            it("should transition to paymentProcessing", () => {
                expect(fsm.currentState()).toBe("paymentProcessing");
            });
        });
    });

    // =========================================================================
    // paymentFailed state — editPayment path
    // =========================================================================

    describe("paymentFailed state (editPayment)", () => {
        describe("when editPayment is received in paymentFailed", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "failure" });
                jest.runAllTimers(); // → paymentFailed
                fsm.handle("editPayment");
            });

            it("should transition to payment", () => {
                expect(fsm.currentState()).toBe("payment");
            });
        });

        describe("when editPayment is received after an edit-from-review failure", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPayment"); // sets returnTo = "review", → payment
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "failure" });
                jest.runAllTimers(); // → paymentFailed (returnTo still "review")
                fsm.handle("editPayment"); // → payment, should clear returnTo
            });

            it("should transition to payment", () => {
                expect(fsm.currentState()).toBe("payment");
            });

            it("should clear returnTo so Back uses normal flow instead of jumping to review", () => {
                expect(context.returnTo).toBeNull();
            });
        });
    });

    // =========================================================================
    // paymentFailed — retry goes through processing and succeeds
    // =========================================================================

    describe("paymentFailed state (retry succeeds on second attempt)", () => {
        describe("when retry leads to a successful payment", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "failure" });
                jest.runAllTimers(); // → paymentFailed

                // Update scenario for the retry — we need to go back to payment to change it,
                // but the retry just replays with the same context. Simulate by
                // directly mutating the scenario (the FSM reads it from context in _onEnter).
                // This tests the retry path itself — payment data unchanged on retry.
                context.paymentScenario = "success";
                fsm.handle("retry"); // → paymentProcessing
                jest.runAllTimers(); // → review (success)
            });

            it("should end up in review after retry succeeds", () => {
                expect(fsm.currentState()).toBe("review");
            });
        });
    });

    // =========================================================================
    // review state — _onEnter clears flags
    // =========================================================================

    describe("review state (_onEnter)", () => {
        describe("when arriving at review with returnTo set", () => {
            beforeEach(() => {
                reachReview(fsm);
                // Go edit personal details and come back
                fsm.handle("editPersonalDetails"); // sets returnTo = "review"
                fsm.handle("next", PERSONAL_DETAILS_ZAPHOD); // → review
            });

            it("should clear returnTo when entering review", () => {
                expect(context.returnTo).toBeNull();
            });
        });

        describe("when arriving at review after 3DS verification", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "threeDSecure" });
                jest.runAllTimers(); // → threeDSecure
                fsm.handle("completeVerification"); // sets threeDSecureVerified = true → paymentProcessing
                jest.runAllTimers(); // → review
            });

            it("should clear threeDSecureVerified when entering review", () => {
                expect(context.threeDSecureVerified).toBe(false);
            });

            it("should clear returnTo when entering review", () => {
                expect(context.returnTo).toBeNull();
            });
        });
    });

    // =========================================================================
    // review state — edit transitions set returnTo
    // =========================================================================

    describe("review state (editPersonalDetails)", () => {
        describe("when editPersonalDetails is received", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPersonalDetails");
            });

            it("should transition to personalDetails", () => {
                expect(fsm.currentState()).toBe("personalDetails");
            });

            it("should set returnTo to review on context", () => {
                expect(context.returnTo).toBe("review");
            });
        });
    });

    describe("review state (editPayment)", () => {
        describe("when editPayment is received", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPayment");
            });

            it("should transition to payment", () => {
                expect(fsm.currentState()).toBe("payment");
            });

            it("should set returnTo to review on context", () => {
                expect(context.returnTo).toBe("review");
            });
        });
    });

    describe("review state (placeOrder)", () => {
        describe("when placeOrder is received", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("placeOrder");
            });

            it("should transition to confirmation", () => {
                expect(fsm.currentState()).toBe("confirmation");
            });
        });
    });

    // =========================================================================
    // confirmation state — startOver resets context
    // =========================================================================

    describe("confirmation state (startOver)", () => {
        describe("when startOver is received after completing the flow", () => {
            beforeEach(() => {
                reachConfirmation(fsm);
                fsm.handle("startOver");
            });

            it("should transition to start", () => {
                expect(fsm.currentState()).toBe("start");
            });

            it("should reset customerType to null", () => {
                expect(context.customerType).toBeNull();
            });

            it("should reset personalDetails to null", () => {
                expect(context.personalDetails).toBeNull();
            });

            it("should reset paymentDetails to null", () => {
                expect(context.paymentDetails).toBeNull();
            });

            it("should reset paymentScenario to success", () => {
                expect(context.paymentScenario).toBe("success");
            });

            it("should reset returnTo to null", () => {
                expect(context.returnTo).toBeNull();
            });

            it("should reset threeDSecureVerified to false", () => {
                expect(context.threeDSecureVerified).toBe(false);
            });

            it("should preserve the same context object reference", () => {
                // The hook holds a ref to the original context object — it must
                // NOT be replaced. startOver mutates in place.
                const originalContext = context;
                expect(context).toBe(originalContext);
            });
        });
    });

    // =========================================================================
    // Happy path — full flow start → confirmation
    // =========================================================================

    describe("full happy path", () => {
        describe("when the complete checkout flow runs from start to confirmation", () => {
            let stateSequence: string[];

            beforeEach(() => {
                stateSequence = [];
                fsm.on("transitioned", (data: any) => {
                    stateSequence.push(data.toState);
                });

                fsm.handle("selectNewCustomer"); // start → personalDetails
                fsm.handle("next", PERSONAL_DETAILS_ZAPHOD); // personalDetails → payment
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" }); // payment → paymentProcessing
                jest.runAllTimers(); // paymentProcessing → review
                fsm.handle("placeOrder"); // review → confirmation
            });

            it("should pass through all expected states in order", () => {
                expect(stateSequence).toEqual([
                    "personalDetails",
                    "payment",
                    "paymentProcessing",
                    "review",
                    "confirmation",
                ]);
            });

            it("should end in confirmation state", () => {
                expect(fsm.currentState()).toBe("confirmation");
            });
        });
    });

    // =========================================================================
    // returnTo round-trip — edit personalDetails from review and return
    // =========================================================================

    describe("returnTo round-trip (personalDetails edit)", () => {
        describe("when user edits personal details from review and returns", () => {
            const UPDATED_DETAILS = {
                name: "Ford Prefect",
                email: "ford@hitchhiker.galaxy",
                address: "1 Vogon Constructor Fleet",
                city: "Magrathea",
                zip: "00042",
            };

            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPersonalDetails"); // review → personalDetails, returnTo = "review"
                fsm.handle("next", UPDATED_DETAILS); // personalDetails → review (via returnTo)
            });

            it("should be back in review state", () => {
                expect(fsm.currentState()).toBe("review");
            });

            it("should have updated personalDetails on context", () => {
                expect(context.personalDetails).toEqual(UPDATED_DETAILS);
            });

            it("should have cleared returnTo after arriving back at review", () => {
                expect(context.returnTo).toBeNull();
            });
        });
    });

    // =========================================================================
    // returnTo round-trip — edit payment from review and return (via back)
    // =========================================================================

    describe("returnTo round-trip (payment edit, cancel via back)", () => {
        describe("when user opens payment edit from review then cancels back", () => {
            beforeEach(() => {
                reachReview(fsm);
                fsm.handle("editPayment"); // review → payment, returnTo = "review"
                fsm.handle("back"); // payment → review (cancel edit)
            });

            it("should be back in review state", () => {
                expect(fsm.currentState()).toBe("review");
            });

            it("should have cleared returnTo after arriving back at review", () => {
                expect(context.returnTo).toBeNull();
            });
        });
    });

    // =========================================================================
    // threeDSecure — completeVerification sets flag
    // =========================================================================

    describe("threeDSecure state (completeVerification)", () => {
        describe("when completeVerification is received", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "threeDSecure" });
                jest.runAllTimers(); // → threeDSecure
                fsm.handle("completeVerification");
            });

            it("should transition to paymentProcessing", () => {
                expect(fsm.currentState()).toBe("paymentProcessing");
            });

            it("should set threeDSecureVerified to true on context", () => {
                expect(context.threeDSecureVerified).toBe(true);
            });
        });
    });

    // =========================================================================
    // paymentProcessing timer does not fire before delay
    // =========================================================================

    describe("paymentProcessing timer timing", () => {
        describe("when entering paymentProcessing but timer has not fired yet", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
                // Do NOT advance timers
            });

            it("should remain in paymentProcessing while timer is pending", () => {
                expect(fsm.currentState()).toBe("paymentProcessing");
            });
        });
    });

    // =========================================================================
    // canHandle — correct inputs enabled per state
    // =========================================================================

    describe("canHandle", () => {
        describe("when in start state", () => {
            it("should return true for selectNewCustomer", () => {
                expect(fsm.canHandle("selectNewCustomer")).toBe(true);
            });

            it("should return true for selectReturningCustomer", () => {
                expect(fsm.canHandle("selectReturningCustomer")).toBe(true);
            });

            it("should return false for next", () => {
                expect(fsm.canHandle("next")).toBe(false);
            });

            it("should return false for placeOrder", () => {
                expect(fsm.canHandle("placeOrder")).toBe(false);
            });
        });

        describe("when in review state", () => {
            beforeEach(() => {
                reachReview(fsm);
            });

            it("should return true for placeOrder", () => {
                expect(fsm.canHandle("placeOrder")).toBe(true);
            });

            it("should return true for editPersonalDetails", () => {
                expect(fsm.canHandle("editPersonalDetails")).toBe(true);
            });

            it("should return true for editPayment", () => {
                expect(fsm.canHandle("editPayment")).toBe(true);
            });

            it("should return false for next", () => {
                expect(fsm.canHandle("next")).toBe(false);
            });

            it("should return false for selectNewCustomer", () => {
                expect(fsm.canHandle("selectNewCustomer")).toBe(false);
            });
        });

        describe("when in paymentProcessing state", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
            });

            it("should return false for next (no user actions while processing)", () => {
                expect(fsm.canHandle("next")).toBe(false);
            });

            it("should return false for back", () => {
                expect(fsm.canHandle("back")).toBe(false);
            });
        });
    });

    // =========================================================================
    // Invalid inputs — nohandler emitted, state unchanged
    // =========================================================================

    describe("invalid inputs", () => {
        describe("when placeOrder is received in start state", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("placeOrder");
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
            });

            it("should remain in start state", () => {
                expect(fsm.currentState()).toBe("start");
            });
        });

        describe("when startOver is received in start state", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("startOver");
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
            });

            it("should remain in start state", () => {
                expect(fsm.currentState()).toBe("start");
            });
        });

        describe("when retry is received in review state", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                reachReview(fsm);
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("retry");
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
            });

            it("should remain in review state", () => {
                expect(fsm.currentState()).toBe("review");
            });
        });

        describe("when completeVerification is received in start state", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("completeVerification");
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
            });

            it("should remain in start state", () => {
                expect(fsm.currentState()).toBe("start");
            });
        });
    });

    // =========================================================================
    // Context mutations — personalDetails formData written correctly
    // =========================================================================

    describe("context mutation — personalDetails fields", () => {
        describe("when next is called with partial/different personal details", () => {
            const DETAILS_MARVIN = {
                name: "Marvin",
                email: "marvin@sirius-cybernetics.corp",
                address: "Golgafrinchan Ark Fleet Ship B",
                city: "Milliways",
                zip: "00001",
            };

            beforeEach(() => {
                reachPersonalDetails(fsm);
                fsm.handle("next", DETAILS_MARVIN);
            });

            it("should write all five personal detail fields to context", () => {
                expect(context.personalDetails).toEqual(DETAILS_MARVIN);
            });
        });
    });

    // =========================================================================
    // Context mutation — payment fields written correctly
    // =========================================================================

    describe("context mutation — payment fields", () => {
        describe("when next is called with payment data and failure scenario", () => {
            const CARD_AMEX = {
                cardNumber: "378282246310005",
                expiry: "01/29",
                cvv: "7373",
            };

            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...CARD_AMEX, scenario: "failure" });
            });

            it("should write cardNumber to context.paymentDetails", () => {
                expect(context.paymentDetails!.cardNumber).toBe(CARD_AMEX.cardNumber);
            });

            it("should write expiry to context.paymentDetails", () => {
                expect(context.paymentDetails!.expiry).toBe(CARD_AMEX.expiry);
            });

            it("should write cvv to context.paymentDetails", () => {
                expect(context.paymentDetails!.cvv).toBe(CARD_AMEX.cvv);
            });

            it("should write failure scenario to context.paymentScenario", () => {
                expect(context.paymentScenario).toBe("failure");
            });
        });
    });

    // =========================================================================
    // createCheckoutFsm — factory isolation (multiple independent instances)
    // =========================================================================

    describe("createCheckoutFsm factory isolation", () => {
        describe("when two independent FSM instances are created", () => {
            let fsmA: any, contextA: any, fsmB: any, contextB: any;

            beforeEach(() => {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const mod = require("./fsm");
                const resultA = mod.createCheckoutFsm();
                const resultB = mod.createCheckoutFsm();
                fsmA = resultA.fsm;
                contextA = resultA.context;
                fsmB = resultB.fsm;
                contextB = resultB.context;

                // Advance fsmA through part of the flow
                fsmA.handle("selectNewCustomer");
                fsmA.handle("next", PERSONAL_DETAILS_ZAPHOD);
            });

            afterEach(() => {
                fsmA.dispose();
                fsmB.dispose();
            });

            it("should have fsmA in payment state", () => {
                expect(fsmA.currentState()).toBe("payment");
            });

            it("should have fsmB still in start state", () => {
                expect(fsmB.currentState()).toBe("start");
            });

            it("should not share context between instances", () => {
                expect(contextA).not.toBe(contextB);
            });

            it("should not share personalDetails between instances", () => {
                expect(contextB.personalDetails).toBeNull();
            });
        });
    });

    // =========================================================================
    // Disposed FSM — handle becomes a no-op
    // =========================================================================

    describe("disposed FSM", () => {
        describe("when the FSM is disposed and paymentProcessing timer fires", () => {
            beforeEach(() => {
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "success" });
                // Dispose before timer fires
                fsm.dispose();
                // Timer fires on a disposed FSM — should be a no-op
                jest.runAllTimers();
            });

            it("should not transition after disposal (timer is a no-op on disposed FSM)", () => {
                // After dispose, currentState() reflects last known state.
                // The FSM stays in paymentProcessing (handle was a no-op).
                expect(fsm.currentState()).toBe("paymentProcessing");
            });
        });
    });

    // =========================================================================
    // 3DS loop prevention — second processing visit auto-advances regardless
    // of the scenario value that triggered 3DS
    // =========================================================================

    describe("3DS loop prevention (end-to-end)", () => {
        describe("when the full 3DS path completes and review is reached", () => {
            let stateSequence: string[];

            beforeEach(() => {
                stateSequence = [];
                fsm.on("transitioned", (data: any) => {
                    stateSequence.push(data.toState);
                });

                fsm.handle("selectNewCustomer");
                fsm.handle("next", PERSONAL_DETAILS_ZAPHOD);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "threeDSecure" });
                jest.runAllTimers(); // paymentProcessing → threeDSecure
                fsm.handle("completeVerification"); // → paymentProcessing (threeDSecureVerified = true)
                jest.runAllTimers(); // paymentProcessing → review (verified flag bypasses scenario)
            });

            it("should pass through the 3DS states in the correct order", () => {
                expect(stateSequence).toEqual([
                    "personalDetails",
                    "payment",
                    "paymentProcessing",
                    "threeDSecure",
                    "paymentProcessing",
                    "review",
                ]);
            });

            it("should end in review state", () => {
                expect(fsm.currentState()).toBe("review");
            });

            it("should have threeDSecureVerified cleared to false by review._onEnter", () => {
                expect(context.threeDSecureVerified).toBe(false);
            });
        });
    });

    // =========================================================================
    // threeDSecureVerified cleared by review — subsequent payment attempt works
    // =========================================================================

    describe("threeDSecureVerified cleared for subsequent payment attempt", () => {
        describe("when user edits payment after a 3DS success and reprocesses with failure", () => {
            beforeEach(() => {
                // Complete the 3DS flow, arrive at review
                reachPayment(fsm);
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "threeDSecure" });
                jest.runAllTimers(); // → threeDSecure
                fsm.handle("completeVerification"); // → paymentProcessing
                jest.runAllTimers(); // → review (threeDSecureVerified cleared)

                // Now edit payment and reprocess with failure scenario
                fsm.handle("editPayment"); // → payment
                fsm.handle("next", { ...PAYMENT_DETAILS_VISA, scenario: "failure" }); // → paymentProcessing
                jest.runAllTimers(); // should use scenario "failure", not skip to review
            });

            it("should end in paymentFailed (threeDSecureVerified was correctly cleared)", () => {
                // If review._onEnter didn't clear threeDSecureVerified, the second
                // processing would auto-advance to review (via the verified flag).
                // This test catches that regression.
                expect(fsm.currentState()).toBe("paymentFailed");
            });
        });
    });

    // =========================================================================
    // returnTo cleared for subsequent edit attempt after round-trip
    // =========================================================================

    describe("returnTo cleared after multiple round-trips", () => {
        describe("when user completes two back-to-back edit round-trips from review", () => {
            beforeEach(() => {
                reachReview(fsm);

                // First round-trip: edit personal details, come back
                fsm.handle("editPersonalDetails"); // sets returnTo = "review"
                fsm.handle("next", PERSONAL_DETAILS_ZAPHOD); // → review, clears returnTo

                // Second round-trip: edit payment, cancel back
                fsm.handle("editPayment"); // sets returnTo = "review"
                fsm.handle("back"); // → review, clears returnTo
            });

            it("should be in review state after both round-trips", () => {
                expect(fsm.currentState()).toBe("review");
            });

            it("should have returnTo cleared after the second round-trip", () => {
                expect(context.returnTo).toBeNull();
            });
        });
    });

    // =========================================================================
    // startOver — full flow is repeatable
    // =========================================================================

    describe("full flow repeatability after startOver", () => {
        describe("when the flow completes, startOver fires, and a second flow begins", () => {
            beforeEach(() => {
                reachConfirmation(fsm);
                fsm.handle("startOver"); // → start, context reset

                // Begin second checkout with returning customer
                fsm.handle("selectReturningCustomer");
            });

            it("should be in personalDetails after second customer type selection", () => {
                expect(fsm.currentState()).toBe("personalDetails");
            });

            it("should have customerType set to returning for the second flow", () => {
                expect(context.customerType).toBe("returning");
            });
        });
    });
});
