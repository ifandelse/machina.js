/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// fsm.test.ts — ShoppingCart FSM tests
//
// Verifies defer() behavior, state transitions, timer lifecycle, and the
// reset input from every state. Tests use Jest fake timers to control
// async operation durations deterministically.
//
// Key FSM patterns tested here:
//   - defer({ until: "state" }) — targeted defer, replays at specific state
//   - defer() — untargeted defer (error state catch-all)
//   - _onEnter timer starts, _onExit timer clears
//   - reset returns to browsing from any state
//   - Custom event emission (itemAdded, couponApplied, etc.)
// =============================================================================

describe("ShoppingCart FSM (fsm.ts)", () => {
    let fsm: any;
    let createShoppingCartFsm: any;

    // The operation durations from config — we'll verify timers fire at the right time
    let VALIDATION_DURATION_MS: number;
    let DISCOUNT_DURATION_MS: number;
    let RESERVATION_DURATION_MS: number;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        const configMod = await import("./config");
        VALIDATION_DURATION_MS = configMod.VALIDATION_DURATION_MS;
        DISCOUNT_DURATION_MS = configMod.DISCOUNT_DURATION_MS;
        RESERVATION_DURATION_MS = configMod.RESERVATION_DURATION_MS;

        const mod = await import("./fsm");
        createShoppingCartFsm = mod.createShoppingCartFsm;

        // Use a fresh FSM instance for each test (default speed: 1x)
        fsm = createShoppingCartFsm();
    });

    afterEach(() => {
        fsm.dispose();
        jest.useRealTimers();
    });

    // =========================================================================
    // Initial state
    // =========================================================================

    describe("initial state", () => {
        describe("when a new FSM is created", () => {
            it("should start in browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });

            it("should have itemCount of 0", () => {
                // We can't read context directly, but we can verify checkout
                // is blocked (itemCount=0 guard returns early without transitioning)
                fsm.handle("checkout");
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // browsing state — addItem
    // =========================================================================

    describe("browsing state — addItem", () => {
        describe("when addItem is dispatched in browsing", () => {
            let events: any[];

            beforeEach(() => {
                events = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    events.push({ eventName, data });
                });
                fsm.handle("addItem");
            });

            it("should transition to validating", () => {
                expect(fsm.currentState()).toBe("validating");
            });

            it("should emit itemAdded with itemCount 1", () => {
                const itemAdded = events.find((e: any) => e.eventName === "itemAdded");
                expect(itemAdded).toBeDefined();
                expect(itemAdded.data).toEqual({ itemCount: 1 });
            });
        });

        describe("when addItem is dispatched twice in browsing", () => {
            beforeEach(() => {
                // First addItem → validating; advance timer back to browsing
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                // Back in browsing, add again
                fsm.handle("addItem");
            });

            it("should transition to validating again", () => {
                expect(fsm.currentState()).toBe("validating");
            });
        });
    });

    // =========================================================================
    // browsing state — applyCoupon
    // =========================================================================

    describe("browsing state — applyCoupon", () => {
        describe("when applyCoupon is dispatched in browsing", () => {
            let events: any[];

            beforeEach(() => {
                events = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    events.push({ eventName, data });
                });
                fsm.handle("applyCoupon");
            });

            it("should transition to applyingDiscount", () => {
                expect(fsm.currentState()).toBe("applyingDiscount");
            });

            it("should emit couponApplied", () => {
                const evt = events.find((e: any) => e.eventName === "couponApplied");
                expect(evt).toBeDefined();
            });
        });
    });

    // =========================================================================
    // browsing state — checkout (empty cart guard)
    // =========================================================================

    describe("browsing state — checkout with empty cart", () => {
        describe("when checkout is dispatched with itemCount 0", () => {
            beforeEach(() => {
                fsm.handle("checkout");
            });

            it("should remain in browsing (empty cart guard)", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // browsing state — checkout with items
    // =========================================================================

    describe("browsing state — checkout with items", () => {
        describe("when checkout is dispatched after adding an item", () => {
            let events: any[];

            beforeEach(() => {
                events = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    events.push({ eventName, data });
                });
                // Add item and let validation complete
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                // Now in browsing with itemCount=1
                fsm.handle("checkout");
            });

            it("should transition to reservingInventory", () => {
                expect(fsm.currentState()).toBe("reservingInventory");
            });

            it("should emit checkoutInitiated", () => {
                const evt = events.find((e: any) => e.eventName === "checkoutInitiated");
                expect(evt).toBeDefined();
            });
        });
    });

    // =========================================================================
    // browsing state — recordPurchaseAnalytics defers to checkout
    // =========================================================================

    describe("browsing state — recordPurchaseAnalytics defer", () => {
        describe("when recordPurchaseAnalytics is dispatched in browsing", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });
                fsm.handle("recordPurchaseAnalytics");
            });

            it("should remain in browsing (deferred, not handled)", () => {
                expect(fsm.currentState()).toBe("browsing");
            });

            it("should emit a deferred event for recordPurchaseAnalytics", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("recordPurchaseAnalytics");
            });
        });
    });

    // =========================================================================
    // validating state — auto-transition via timer
    // =========================================================================

    describe("validating state — timer auto-transition", () => {
        describe("when the validation timer fires", () => {
            beforeEach(() => {
                fsm.handle("addItem"); // → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
            });

            it("should transition back to browsing after validation completes", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });

        describe("when the validation timer has not fired yet", () => {
            beforeEach(() => {
                fsm.handle("addItem"); // → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS - 100);
            });

            it("should remain in validating before the timer fires", () => {
                expect(fsm.currentState()).toBe("validating");
            });
        });
    });

    // =========================================================================
    // validating state — applyCoupon defers to browsing
    // =========================================================================

    describe("validating state — applyCoupon deferred and replayed", () => {
        describe("when applyCoupon is dispatched during validating", () => {
            let deferredEvents: any[];
            let transitionedEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                transitionedEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });
                fsm.on("transitioned", (data: any) => {
                    transitionedEvents.push(data);
                });

                fsm.handle("addItem"); // → validating
                fsm.handle("applyCoupon"); // should defer until browsing
            });

            it("should remain in validating after the defer", () => {
                expect(fsm.currentState()).toBe("validating");
            });

            it("should emit a deferred event for applyCoupon", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("applyCoupon");
            });

            describe("when validation completes (timer fires)", () => {
                beforeEach(() => {
                    jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                });

                it("should replay applyCoupon — transitioning to applyingDiscount", () => {
                    // After browsing, the deferred applyCoupon replays and transitions to applyingDiscount
                    expect(fsm.currentState()).toBe("applyingDiscount");
                });

                it("should have transitioned through browsing on the way to applyingDiscount", () => {
                    const states = transitionedEvents.map((e: any) => e.toState);
                    expect(states).toContain("browsing");
                    expect(states).toContain("applyingDiscount");
                });
            });
        });
    });

    // =========================================================================
    // validating state — checkout defers to browsing
    // =========================================================================

    describe("validating state — checkout deferred and replayed", () => {
        describe("when checkout is dispatched during validating (after adding an item)", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                fsm.handle("addItem"); // → validating, itemCount=1
                fsm.handle("checkout"); // should defer until browsing
            });

            it("should remain in validating after the defer", () => {
                expect(fsm.currentState()).toBe("validating");
            });

            it("should emit a deferred event for checkout", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("checkout");
            });

            describe("when validation completes (timer fires)", () => {
                beforeEach(() => {
                    jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                });

                it("should replay checkout — transitioning to reservingInventory", () => {
                    expect(fsm.currentState()).toBe("reservingInventory");
                });
            });
        });
    });

    // =========================================================================
    // validating state — recordPurchaseAnalytics defers to checkout
    // =========================================================================

    describe("validating state — recordPurchaseAnalytics deferred", () => {
        describe("when recordPurchaseAnalytics is dispatched during validating", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                fsm.handle("addItem"); // → validating
                fsm.handle("recordPurchaseAnalytics"); // should defer until checkout
            });

            it("should emit a deferred event for recordPurchaseAnalytics", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("recordPurchaseAnalytics");
            });

            it("should remain in validating", () => {
                expect(fsm.currentState()).toBe("validating");
            });
        });
    });

    // =========================================================================
    // applyingDiscount state — timer auto-transition
    // =========================================================================

    describe("applyingDiscount state — timer auto-transition", () => {
        describe("when the discount timer fires", () => {
            beforeEach(() => {
                fsm.handle("applyCoupon"); // → applyingDiscount
                jest.advanceTimersByTime(DISCOUNT_DURATION_MS + 100);
            });

            it("should transition back to browsing after discount is applied", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // applyingDiscount state — checkout defers to browsing
    // =========================================================================

    describe("applyingDiscount state — checkout deferred", () => {
        describe("when checkout is dispatched during applyingDiscount (with items)", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                // Add item first so itemCount > 0
                fsm.handle("addItem"); // → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing

                fsm.handle("applyCoupon"); // → applyingDiscount
                fsm.handle("checkout"); // should defer until browsing
            });

            it("should remain in applyingDiscount after the defer", () => {
                expect(fsm.currentState()).toBe("applyingDiscount");
            });

            it("should emit a deferred event for checkout", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("checkout");
            });

            describe("when discount is applied (timer fires)", () => {
                beforeEach(() => {
                    jest.advanceTimersByTime(DISCOUNT_DURATION_MS + 100);
                });

                it("should replay checkout — transitioning to reservingInventory", () => {
                    expect(fsm.currentState()).toBe("reservingInventory");
                });
            });
        });
    });

    // =========================================================================
    // reservingInventory state — timer auto-transition
    // =========================================================================

    describe("reservingInventory state — timer auto-transition", () => {
        describe("when the reservation timer fires", () => {
            beforeEach(() => {
                // Get to reservingInventory: add item, validate, checkout
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100);
            });

            it("should transition to checkout after inventory is reserved", () => {
                expect(fsm.currentState()).toBe("checkout");
            });
        });
    });

    // =========================================================================
    // recordPurchaseAnalytics deferred across multiple states, executes at checkout
    // =========================================================================

    describe("recordPurchaseAnalytics — deferred across states, executes at checkout", () => {
        describe("when recordPurchaseAnalytics is fired in browsing and the cart progresses to checkout", () => {
            let analyticsEvents: any[];
            let deferredEvents: any[];

            beforeEach(() => {
                analyticsEvents = [];
                deferredEvents = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "analyticsRecorded") {
                        analyticsEvents.push({ eventName, data });
                    }
                });
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                // Fire analytics early — it should defer until checkout
                fsm.handle("recordPurchaseAnalytics"); // defer(checkout) in browsing

                // Progress to checkout
                fsm.handle("addItem"); // → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("checkout"); // → reservingInventory
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100); // → checkout (analytics replays here)
            });

            it("should have deferred recordPurchaseAnalytics at least once", () => {
                expect(
                    deferredEvents.some((e: any) => e.inputName === "recordPurchaseAnalytics")
                ).toBe(true);
            });

            it("should emit analyticsRecorded when checkout state is reached", () => {
                expect(analyticsEvents).toHaveLength(1);
            });

            it("should be in checkout after analytics fires", () => {
                expect(fsm.currentState()).toBe("checkout");
            });
        });
    });

    // =========================================================================
    // checkout state — confirm → confirmed
    // =========================================================================

    describe("checkout state — confirm", () => {
        describe("when confirm is dispatched in checkout", () => {
            let events: any[];

            beforeEach(() => {
                events = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    events.push({ eventName, data });
                });

                // Navigate to checkout
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100);

                // Confirm
                fsm.handle("confirm");
            });

            it("should transition to confirmed", () => {
                expect(fsm.currentState()).toBe("confirmed");
            });

            it("should emit orderConfirmed", () => {
                const evt = events.find((e: any) => e.eventName === "orderConfirmed");
                expect(evt).toBeDefined();
            });
        });
    });

    // =========================================================================
    // confirmed state — terminal, only reset works
    // =========================================================================

    describe("confirmed state — terminal", () => {
        describe("when an action is dispatched in confirmed state", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                // Navigate to confirmed
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100);
                fsm.handle("confirm");

                // Try to dispatch an action in the terminal state
                fsm.handle("addItem");
            });

            it("should remain in confirmed", () => {
                expect(fsm.currentState()).toBe("confirmed");
            });

            it("should emit nohandler for addItem in confirmed", () => {
                expect(nohandlerEvents).toHaveLength(1);
                expect(nohandlerEvents[0].inputName).toBe("addItem");
            });
        });
    });

    // =========================================================================
    // error state — untargeted defer on catch-all
    // =========================================================================

    describe("error state — untargeted defer catch-all", () => {
        describe("when an input is dispatched in error state", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                // Navigate to error via direct transition (not wired to UI)
                fsm.transition("error");
                fsm.handle("addItem");
            });

            it("should defer the input (untargeted) via the catch-all", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("addItem");
            });

            it("should remain in error state after the defer", () => {
                expect(fsm.currentState()).toBe("error");
            });
        });

        describe("when retry is dispatched in error state", () => {
            beforeEach(() => {
                fsm.transition("error");
                fsm.handle("retry");
            });

            it("should transition to browsing on retry", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // reset from any state
    // =========================================================================

    describe("reset from validating", () => {
        describe("when reset is dispatched during validating", () => {
            beforeEach(() => {
                fsm.handle("addItem"); // → validating
                fsm.handle("reset");
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });

            it("should clear the timer so validationComplete does not fire afterward", () => {
                // If the timer fires after reset, it would try to emit validationComplete
                // in browsing — which has no handler and would emit nohandler.
                const nohandlerEvents: any[] = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                // validationComplete should not fire — _onExit cleared the timer
                expect(nohandlerEvents).toHaveLength(0);
            });
        });
    });

    describe("reset from applyingDiscount", () => {
        describe("when reset is dispatched during applyingDiscount", () => {
            beforeEach(() => {
                fsm.handle("applyCoupon"); // → applyingDiscount
                fsm.handle("reset");
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    describe("reset from reservingInventory", () => {
        describe("when reset is dispatched during reservingInventory", () => {
            beforeEach(() => {
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                fsm.handle("reset");
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    describe("reset from checkout", () => {
        describe("when reset is dispatched in checkout", () => {
            beforeEach(() => {
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100);
                fsm.handle("reset");
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    describe("reset from confirmed", () => {
        describe("when reset is dispatched in confirmed", () => {
            beforeEach(() => {
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100);
                fsm.handle("confirm");
                fsm.handle("reset");
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // Speed multiplier — duration scales with getter
    // =========================================================================

    describe("speed multiplier", () => {
        describe("when speed multiplier is set to 2x (slower)", () => {
            beforeEach(() => {
                fsm.dispose();
                fsm = createShoppingCartFsm(() => 2);
                fsm.handle("addItem"); // → validating with 2x duration
            });

            it("should remain in validating when only 1x duration has elapsed", () => {
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                expect(fsm.currentState()).toBe("validating");
            });

            it("should transition to browsing when 2x duration has elapsed", () => {
                jest.advanceTimersByTime(VALIDATION_DURATION_MS * 2 + 100);
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // createShoppingCartFsm factory — independent instances
    // =========================================================================

    describe("createShoppingCartFsm() factory", () => {
        describe("when two independent FSM instances are created", () => {
            let fsmA: any, fsmB: any;

            beforeEach(() => {
                fsmA = createShoppingCartFsm();
                fsmB = createShoppingCartFsm();

                fsmA.handle("addItem"); // → validating
                // fsmB stays in browsing
            });

            afterEach(() => {
                fsmA.dispose();
                fsmB.dispose();
            });

            it("should have fsmA in validating", () => {
                expect(fsmA.currentState()).toBe("validating");
            });

            it("should have fsmB in browsing (unaffected)", () => {
                expect(fsmB.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // HARDENING TESTS — edge cases, boundary conditions, failure modes
    // =========================================================================

    // =========================================================================
    // itemCount accumulation — multiple addItem calls
    // =========================================================================

    describe("itemCount accumulation", () => {
        describe("when addItem is dispatched three times across validation cycles", () => {
            let events: any[];

            beforeEach(() => {
                events = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    events.push({ eventName, data });
                });
                fsm.handle("addItem"); // itemCount → 1, → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("addItem"); // itemCount → 2, → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("addItem"); // itemCount → 3, → validating
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
            });

            it("should emit itemAdded with incrementing itemCount values", () => {
                const itemAddedEvents = events.filter((e: any) => e.eventName === "itemAdded");
                expect(itemAddedEvents[0].data).toEqual({ itemCount: 1 });
                expect(itemAddedEvents[1].data).toEqual({ itemCount: 2 });
                expect(itemAddedEvents[2].data).toEqual({ itemCount: 3 });
            });

            it("should allow checkout after multiple items are added", () => {
                fsm.handle("checkout");
                expect(fsm.currentState()).toBe("reservingInventory");
            });
        });
    });

    // =========================================================================
    // reset clears itemCount — checkout guard re-engages after reset
    // =========================================================================

    describe("reset clears itemCount", () => {
        describe("when reset is dispatched after adding an item", () => {
            beforeEach(() => {
                fsm.handle("addItem"); // itemCount → 1
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("reset"); // itemCount → 0, → browsing
            });

            it("should block checkout after reset (itemCount is 0 again)", () => {
                fsm.handle("checkout");
                expect(fsm.currentState()).toBe("browsing");
            });
        });

        describe("when reset is dispatched from browsing", () => {
            beforeEach(() => {
                fsm.handle("addItem"); // itemCount → 1
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("reset"); // itemCount → 0 via browsing.reset
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // reservingInventory — intent chokepoint (nohandler for most inputs)
    // =========================================================================

    describe("reservingInventory state — applyCoupon has no handler", () => {
        describe("when applyCoupon is dispatched during reservingInventory", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("checkout"); // → reservingInventory
                fsm.handle("applyCoupon"); // no handler — chokepoint
            });

            it("should remain in reservingInventory", () => {
                expect(fsm.currentState()).toBe("reservingInventory");
            });

            it("should emit nohandler for applyCoupon", () => {
                expect(nohandlerEvents).toHaveLength(1);
                expect(nohandlerEvents[0].inputName).toBe("applyCoupon");
            });
        });
    });

    describe("reservingInventory state — recordPurchaseAnalytics has no handler", () => {
        describe("when recordPurchaseAnalytics is dispatched during reservingInventory", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("checkout"); // → reservingInventory
                fsm.handle("recordPurchaseAnalytics"); // no handler — chokepoint
            });

            it("should remain in reservingInventory", () => {
                expect(fsm.currentState()).toBe("reservingInventory");
            });

            it("should emit nohandler for recordPurchaseAnalytics", () => {
                expect(nohandlerEvents).toHaveLength(1);
                expect(nohandlerEvents[0].inputName).toBe("recordPurchaseAnalytics");
            });
        });
    });

    // =========================================================================
    // applyingDiscount state — addItem defers to browsing
    // =========================================================================

    describe("applyingDiscount state — addItem deferred", () => {
        describe("when addItem is dispatched during applyingDiscount", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                fsm.handle("applyCoupon"); // → applyingDiscount
                fsm.handle("addItem"); // should defer until browsing
            });

            it("should remain in applyingDiscount", () => {
                expect(fsm.currentState()).toBe("applyingDiscount");
            });

            it("should emit a deferred event for addItem", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("addItem");
            });

            describe("when discount is applied (timer fires)", () => {
                beforeEach(() => {
                    jest.advanceTimersByTime(DISCOUNT_DURATION_MS + 100);
                });

                it("should replay addItem — transitioning to validating", () => {
                    expect(fsm.currentState()).toBe("validating");
                });
            });
        });
    });

    // =========================================================================
    // applyingDiscount state — recordPurchaseAnalytics defers to checkout
    // =========================================================================

    describe("applyingDiscount state — recordPurchaseAnalytics deferred", () => {
        describe("when recordPurchaseAnalytics is dispatched during applyingDiscount", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                fsm.handle("applyCoupon"); // → applyingDiscount
                fsm.handle("recordPurchaseAnalytics"); // should defer until checkout
            });

            it("should emit a deferred event for recordPurchaseAnalytics", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("recordPurchaseAnalytics");
            });

            it("should remain in applyingDiscount", () => {
                expect(fsm.currentState()).toBe("applyingDiscount");
            });
        });
    });

    // =========================================================================
    // Deferred checkout with itemCount=0 at replay time
    //
    // Scenario: checkout is deferred from validating when itemCount was 0 at
    // defer time. When validation completes and checkout replays in browsing,
    // the guard (itemCount === 0) should block the transition.
    // This verifies that the guard is evaluated at REPLAY TIME, not defer time.
    // =========================================================================

    describe("checkout deferred from validating with itemCount=0 at defer time", () => {
        describe("when checkout is dispatched during validating before any item was added", () => {
            let deferredEvents: any[];
            let nohandlerEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                nohandlerEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                // Directly transition to validating without addItem (so itemCount stays 0)
                // This simulates a hypothetical direct dispatch scenario — we use
                // transition() to force the state, then dispatch checkout.
                fsm.transition("validating");
                fsm.handle("checkout"); // deferred, itemCount is still 0
            });

            it("should defer checkout while in validating", () => {
                expect(deferredEvents).toHaveLength(1);
                expect(deferredEvents[0].inputName).toBe("checkout");
            });

            describe("when the FSM transitions back to browsing", () => {
                beforeEach(() => {
                    // Manually transition back to browsing (simulating validationComplete
                    // without having gone through addItem, keeping itemCount=0)
                    fsm.transition("browsing");
                    // The deferred checkout should replay and hit the itemCount guard
                });

                it("should remain in browsing because itemCount is still 0", () => {
                    expect(fsm.currentState()).toBe("browsing");
                });
            });
        });
    });

    // =========================================================================
    // FIFO replay order — multiple deferred inputs of different types
    // =========================================================================

    describe("FIFO defer replay ordering", () => {
        describe("when multiple different inputs are deferred during validating", () => {
            let transitionedEvents: any[];
            let analyticsEvents: any[];

            beforeEach(() => {
                transitionedEvents = [];
                analyticsEvents = [];
                fsm.on("transitioned", (data: any) => {
                    transitionedEvents.push(data);
                });
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "analyticsRecorded") {
                        analyticsEvents.push(data);
                    }
                });

                fsm.handle("addItem"); // → validating, itemCount=1
                // Defer applyCoupon first, then checkout — both target "browsing"
                fsm.handle("applyCoupon"); // deferred until browsing
                fsm.handle("checkout"); // deferred until browsing
                // Let validation complete — both replay in order
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
            });

            it("should replay applyCoupon first (transitioning to applyingDiscount)", () => {
                const states = transitionedEvents.map((e: any) => e.toState);
                // browsing → applyingDiscount (applyCoupon replayed first)
                expect(states).toContain("applyingDiscount");
            });

            it("should end up processing applyCoupon before checkout in FIFO order", () => {
                // applyCoupon replays first → applyingDiscount
                // checkout is still deferred (until browsing again)
                // So we should be in applyingDiscount, not reservingInventory
                expect(fsm.currentState()).toBe("applyingDiscount");
            });
        });
    });

    // =========================================================================
    // Multiple defers of the same input — all replay (FIFO)
    // =========================================================================

    describe("multiple defers of the same input", () => {
        describe("when applyCoupon is dispatched twice during validating", () => {
            let deferredEvents: any[];
            let couponEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                couponEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "couponApplied") {
                        couponEvents.push(data);
                    }
                });

                fsm.handle("addItem"); // → validating
                fsm.handle("applyCoupon"); // deferred #1
                fsm.handle("applyCoupon"); // deferred #2
            });

            it("should produce two deferred events", () => {
                expect(deferredEvents).toHaveLength(2);
                expect(deferredEvents[0].inputName).toBe("applyCoupon");
                expect(deferredEvents[1].inputName).toBe("applyCoupon");
            });

            describe("when validation completes", () => {
                beforeEach(() => {
                    jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                });

                it("should replay the first applyCoupon immediately upon entering browsing", () => {
                    // Both coupons deferred. First replays, goes to applyingDiscount.
                    // Second is still queued (target: browsing, but we're in applyingDiscount now).
                    expect(couponEvents.length).toBeGreaterThanOrEqual(1);
                });
            });
        });
    });

    // =========================================================================
    // error state — reset zeroes itemCount and returns to browsing
    // =========================================================================

    describe("error state — reset", () => {
        describe("when reset is dispatched in error state after items were added", () => {
            beforeEach(() => {
                fsm.handle("addItem"); // itemCount → 1
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.transition("error"); // force into error
                fsm.handle("reset"); // should zero itemCount and go to browsing
            });

            it("should return to browsing", () => {
                expect(fsm.currentState()).toBe("browsing");
            });

            it("should block checkout after reset from error state (itemCount zeroed)", () => {
                fsm.handle("checkout");
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // error state — untargeted deferred inputs replay after retry
    // =========================================================================

    describe("error state — deferred inputs replay after retry", () => {
        describe("when multiple inputs are deferred in error state then retry fires", () => {
            let deferredEvents: any[];
            let transitionedEvents: any[];

            beforeEach(() => {
                deferredEvents = [];
                transitionedEvents = [];
                fsm.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });
                fsm.on("transitioned", (data: any) => {
                    transitionedEvents.push(data);
                });

                fsm.transition("error");
                fsm.handle("addItem"); // untargeted defer
                fsm.handle("applyCoupon"); // untargeted defer
                fsm.handle("retry"); // → browsing; deferred inputs replay
            });

            it("should have deferred both inputs while in error", () => {
                // Both addItem and applyCoupon were deferred before retry
                const deferredInputs = deferredEvents.map((e: any) => e.inputName);
                expect(deferredInputs).toContain("addItem");
                expect(deferredInputs).toContain("applyCoupon");
            });

            it("should replay deferred inputs after retry transitions to browsing", () => {
                // After retry → browsing, deferred addItem and applyCoupon replay.
                // addItem executes: itemCount++ → validating
                // applyCoupon would then be deferred again (in validating)
                // So final state should be validating (addItem replayed) or applyingDiscount
                const finalState = fsm.currentState();
                expect(["validating", "applyingDiscount"]).toContain(finalState);
            });
        });
    });

    // =========================================================================
    // applyCoupon in checkout state — executes (per brief matrix: "Execute")
    // =========================================================================

    describe("checkout state — applyCoupon executes", () => {
        describe("when applyCoupon is dispatched in checkout", () => {
            let couponEvents: any[];

            beforeEach(() => {
                couponEvents = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "couponApplied") {
                        couponEvents.push(data);
                    }
                });

                // Navigate to checkout
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100); // → checkout

                fsm.handle("applyCoupon");
            });

            it("should transition to applyingDiscount", () => {
                expect(fsm.currentState()).toBe("applyingDiscount");
            });

            it("should emit couponApplied", () => {
                expect(couponEvents).toHaveLength(1);
            });
        });
    });

    // =========================================================================
    // Inputs with no handler in checkout — emit nohandler
    // =========================================================================

    describe("checkout state — addItem transitions back to validating", () => {
        let itemAddedEvents: any[];

        beforeEach(() => {
            itemAddedEvents = [];
            fsm.on("*", (eventName: string, data: unknown) => {
                if (eventName === "itemAdded") {
                    itemAddedEvents.push(data);
                }
            });

            // Navigate to checkout
            fsm.handle("addItem");
            jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
            fsm.handle("checkout");
            jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100); // → checkout

            fsm.handle("addItem"); // "one more thing" during checkout
        });

        it("should transition to validating", () => {
            expect(fsm.currentState()).toBe("validating");
        });

        it("should emit itemAdded with incremented count", () => {
            // First addItem in browsing emitted itemCount: 1
            // Second addItem in checkout emits itemCount: 2
            expect(itemAddedEvents).toHaveLength(2);
            expect(itemAddedEvents[1]).toEqual({ itemCount: 2 });
        });
    });

    describe("checkout state — inputs with no handler", () => {
        describe("when checkout is dispatched in checkout state", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100); // → checkout

                fsm.handle("checkout"); // no handler in checkout
            });

            it("should emit nohandler for checkout", () => {
                expect(nohandlerEvents).toHaveLength(1);
                expect(nohandlerEvents[0].inputName).toBe("checkout");
            });
        });
    });

    // =========================================================================
    // Inputs with no handler in reservingInventory — checkout emits nohandler
    // =========================================================================

    describe("reservingInventory state — checkout has no handler", () => {
        describe("when checkout is dispatched during reservingInventory", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout"); // → reservingInventory
                fsm.handle("checkout"); // no handler in reservingInventory
            });

            it("should emit nohandler for checkout", () => {
                expect(nohandlerEvents).toHaveLength(1);
                expect(nohandlerEvents[0].inputName).toBe("checkout");
            });

            it("should remain in reservingInventory", () => {
                expect(fsm.currentState()).toBe("reservingInventory");
            });
        });
    });

    // =========================================================================
    // Speed multiplier edge case — 0 multiplier (timer fires immediately)
    // =========================================================================

    describe("speed multiplier edge cases", () => {
        describe("when speed multiplier is 0 (zero-duration timer)", () => {
            beforeEach(() => {
                fsm.dispose();
                fsm = createShoppingCartFsm(() => 0);
                fsm.handle("addItem"); // → validating with 0ms timer
                jest.advanceTimersByTime(0); // fires immediately
            });

            it("should transition back to browsing immediately", () => {
                expect(fsm.currentState()).toBe("browsing");
            });
        });

        describe("when speed multiplier is a very large value (extreme slow)", () => {
            beforeEach(() => {
                fsm.dispose();
                fsm = createShoppingCartFsm(() => 1000);
                fsm.handle("addItem"); // → validating with 1000x duration
                jest.advanceTimersByTime(VALIDATION_DURATION_MS * 500); // half the expected time
            });

            it("should still be in validating at half the expected duration", () => {
                expect(fsm.currentState()).toBe("validating");
            });
        });
    });

    // =========================================================================
    // _onExit null timer guard — direct transition out of async states
    // without ever starting a timer
    // =========================================================================

    describe("_onExit null timer guard", () => {
        describe("when transitioning out of validating without the timer having started", () => {
            beforeEach(() => {
                // Force into validating via transition() — bypasses _onEnter,
                // so no timer is started, ctx.timer stays null.
                fsm.transition("validating");
                // Immediately transition back — _onExit fires with null timer.
                fsm.transition("browsing");
            });

            it("should not throw when _onExit fires with a null timer", () => {
                // If we got here without an error, the null guard worked correctly.
                expect(fsm.currentState()).toBe("browsing");
            });
        });
    });

    // =========================================================================
    // Deferred applyCoupon from applyingDiscount replays into applyingDiscount
    // =========================================================================

    describe("applyingDiscount state — deferred applyCoupon replays into applyingDiscount", () => {
        describe("when applyCoupon is dispatched during applyingDiscount", () => {
            let couponEvents: any[];

            beforeEach(() => {
                couponEvents = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "couponApplied") {
                        couponEvents.push(data);
                    }
                });

                fsm.handle("applyCoupon"); // → applyingDiscount (first coupon)
                fsm.handle("applyCoupon"); // deferred until browsing (second coupon)
                jest.advanceTimersByTime(DISCOUNT_DURATION_MS + 100); // → browsing, second coupon replays → applyingDiscount
            });

            it("should emit couponApplied twice total", () => {
                // First couponApplied from handle() in browsing, second when deferred coupon replays
                expect(couponEvents.length).toBeGreaterThanOrEqual(2);
            });

            it("should be in applyingDiscount after the second coupon replays", () => {
                expect(fsm.currentState()).toBe("applyingDiscount");
            });
        });
    });

    // =========================================================================
    // Timer cleanup on reset from reservingInventory — stale callback does not fire
    // =========================================================================

    describe("reset from reservingInventory — timer cleanup", () => {
        describe("when reset is dispatched during reservingInventory", () => {
            beforeEach(() => {
                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100); // → browsing
                fsm.handle("checkout"); // → reservingInventory
                fsm.handle("reset"); // → browsing, _onExit should clear timer
            });

            it("should clear the reservation timer so inventoryReserved does not fire afterward", () => {
                const nohandlerEvents: any[] = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100);
                // inventoryReserved should not fire — _onExit cleared the timer
                expect(nohandlerEvents).toHaveLength(0);
            });
        });
    });

    // =========================================================================
    // Timer cleanup on reset from applyingDiscount — stale callback does not fire
    // =========================================================================

    describe("reset from applyingDiscount — timer cleanup", () => {
        describe("when reset is dispatched during applyingDiscount", () => {
            beforeEach(() => {
                fsm.handle("applyCoupon"); // → applyingDiscount
                fsm.handle("reset"); // → browsing, _onExit should clear timer
            });

            it("should clear the discount timer so discountApplied does not fire afterward", () => {
                const nohandlerEvents: any[] = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });
                jest.advanceTimersByTime(DISCOUNT_DURATION_MS + 100);
                // discountApplied should not fire — _onExit cleared the timer
                expect(nohandlerEvents).toHaveLength(0);
            });
        });
    });

    // =========================================================================
    // recordPurchaseAnalytics deferred then executed — stays in checkout
    //
    // recordPurchaseAnalytics has no return value (no state transition).
    // Verifies the FSM doesn't transition out of checkout after analytics fires.
    // =========================================================================

    describe("checkout state — recordPurchaseAnalytics does not change state", () => {
        describe("when recordPurchaseAnalytics is dispatched directly in checkout", () => {
            let analyticsEvents: any[];

            beforeEach(() => {
                analyticsEvents = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "analyticsRecorded") {
                        analyticsEvents.push(data);
                    }
                });

                fsm.handle("addItem");
                jest.advanceTimersByTime(VALIDATION_DURATION_MS + 100);
                fsm.handle("checkout");
                jest.advanceTimersByTime(RESERVATION_DURATION_MS + 100); // → checkout

                fsm.handle("recordPurchaseAnalytics");
            });

            it("should emit analyticsRecorded", () => {
                expect(analyticsEvents).toHaveLength(1);
            });

            it("should remain in checkout after analytics fires", () => {
                expect(fsm.currentState()).toBe("checkout");
            });
        });
    });
});
