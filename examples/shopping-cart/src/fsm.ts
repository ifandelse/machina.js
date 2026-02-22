// =============================================================================
// fsm.ts — ShoppingCart FSM
//
// Read this file first. It's the thing developers came to see. The goal:
// demonstrate defer({ until: "state" }) in a workflow where users fire actions
// faster than the system can process them.
//
// Six states: browsing → validating → browsing (loop)
//                       → applyingDiscount → browsing (loop)
//                         → reservingInventory → checkout → confirmed
//
// Plus an error state that exists only for the untargeted defer() demo.
// It is NOT wired into the demo UI — see the block comment on the error state.
//
// KEY DESIGN DECISIONS (read before the state table):
//
// 1. ASYNC OPERATIONS USE setTimeout IN _onEnter, NOT IN HANDLERS.
//    The FSM transitions into the "working" state. _onEnter starts the timer
//    and stores the ID on context. When the timer fires, it dispatches the
//    completion input via handle() on the same FSM instance. _onExit clears
//    the timer to prevent stale callbacks.
//    This is the idiomatic machina pattern — the FSM drives itself.
//
// 2. INSTANCE CAPTURE FOR TIMER CALLBACKS.
//    The factory declares `let instance` before calling createFsm(). The timer
//    callback closes over `instance`. Because JavaScript is single-threaded and
//    timers are async, `instance` is guaranteed to be assigned by the time any
//    timer fires. This is the same hoisting pattern used in dungeon-critters.
//
// 3. SPEED MULTIPLIER IS A FACTORY PARAMETER, READ AT OPERATION START.
//    The timer duration is: BASE_DURATION * getSpeedMultiplier().
//    The getter is passed to createShoppingCartFsm() so each instance owns
//    its own reference. The slider value is captured when the timer is
//    created, not mid-operation. This is intentional and matches the brief.
//
// 4. THE FSM EMITS CUSTOM EVENTS VIA emit() SO main.ts CAN REACT.
//    "itemAdded", "couponApplied", "checkoutInitiated", "analyticsRecorded",
//    "orderConfirmed" — these tell the orchestrator what just happened without
//    coupling the FSM to UI code.
//
// 5. reset INPUT RETURNS TO browsing FROM ANY STATE.
//    _onExit on the departing state clears the timer. The reset handler also
//    zeroes itemCount so the checkout button disables correctly on reset.
//
// 6. CHECKOUT IS GATED BY itemCount IN THE BROWSING HANDLER.
//    The button is disabled in the UI until itemCount > 0 (see main.ts).
//    The FSM also checks itemCount here as a belt-and-suspenders guard.
// =============================================================================

import { createFsm } from "machina";
import {
    VALIDATION_DURATION_MS,
    DISCOUNT_DURATION_MS,
    RESERVATION_DURATION_MS,
    INPUT_VALIDATION_COMPLETE,
    INPUT_DISCOUNT_APPLIED,
    INPUT_INVENTORY_RESERVED,
    type CartContext,
} from "./config";

// -----------------------------------------------------------------------------
// Factory — exported so tests can create isolated instances
//
// getSpeedMultiplier is a factory parameter so each instance owns its own
// reference. main.ts passes the UI slider getter; tests pass stubs.
// Defaults to () => 1 (real-time) when omitted.
//
// `let instance` is declared before createFsm() is called so that timer
// callbacks in _onEnter can close over it. JavaScript's single-threaded
// event loop guarantees that instance is assigned before any setTimeout
// callback fires — so `instance!.handle(...)` is always safe.
// -----------------------------------------------------------------------------

export function createShoppingCartFsm(getSpeedMultiplier: () => number = () => 1) {
    // Declared before createFsm() so timer callbacks in _onEnter can close over it.
    // TypeScript can't infer the fully-typed FSM return value here (the type
    // depends on the config that hasn't been written yet). We use `any` so the
    // closure compiles — the alternative is a brittle explicit type annotation
    // that would need updating every time the state/input sets change.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let instance: any;

    instance = createFsm({
        id: "shopping-cart",
        initialState: "browsing",
        context: {
            itemCount: 0,
            timer: null,
        } as CartContext,

        states: {
            // ------------------------------------------------------------------
            // browsing — the cart is idle, waiting for user actions
            //
            // addItem kicks off validation. applyCoupon kicks off discount
            // calculation. checkout starts inventory reservation, but only if
            // at least one item is in the cart (enforced by the UI button state
            // and the itemCount guard here).
            //
            // recordPurchaseAnalytics defers until checkout — analytics don't
            // make sense before checkout is triggered. The user might fire it
            // early just to explore. Let them. The FSM handles it gracefully.
            // ------------------------------------------------------------------
            browsing: {
                addItem({ ctx, emit }) {
                    ctx.itemCount++;
                    emit("itemAdded", { itemCount: ctx.itemCount });
                    return "validating";
                },

                applyCoupon({ emit }) {
                    emit("couponApplied");
                    return "applyingDiscount";
                },

                checkout({ ctx, emit }) {
                    // Belt-and-suspenders: the UI disables the button when
                    // itemCount === 0, but guard here too for direct API callers.
                    if (ctx.itemCount === 0) {
                        return;
                    }
                    emit("checkoutInitiated");
                    return "reservingInventory";
                },

                recordPurchaseAnalytics({ defer }) {
                    defer({ until: "checkout" });
                },

                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },

            // ------------------------------------------------------------------
            // validating — async inventory check and price confirmation
            //
            // _onEnter starts the timer. Duration = VALIDATION_DURATION_MS * speed.
            // When it fires, instance.handle("validationComplete") transitions
            // back to browsing. _onExit clears the timer so a reset mid-validation
            // doesn't fire validationComplete into the wrong state.
            //
            // applyCoupon and checkout defer until browsing — the user might
            // click them impatiently. They'll replay when validation completes.
            //
            // recordPurchaseAnalytics defers until checkout — it can't execute
            // earlier regardless of what state we're in.
            // ------------------------------------------------------------------
            validating: {
                _onEnter({ ctx }) {
                    const duration = VALIDATION_DURATION_MS * getSpeedMultiplier();
                    ctx.timer = setTimeout(() => {
                        // instance is assigned before this timer fires
                        // (JS is single-threaded; setTimeout callbacks are async)
                        instance.handle(INPUT_VALIDATION_COMPLETE);
                    }, duration);
                },

                _onExit({ ctx }) {
                    if (ctx.timer !== null) {
                        clearTimeout(ctx.timer);
                        ctx.timer = null;
                    }
                },

                validationComplete: "browsing",

                applyCoupon({ defer }) {
                    defer({ until: "browsing" });
                },

                checkout({ defer }) {
                    defer({ until: "browsing" });
                },

                recordPurchaseAnalytics({ defer }) {
                    defer({ until: "checkout" });
                },

                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },

            // ------------------------------------------------------------------
            // applyingDiscount — async discount calculation
            //
            // Same timer pattern as validating. discountApplied transitions to
            // browsing. checkout defers until browsing because we need the
            // discount applied before checking out (UX assumption).
            //
            // addItem defers until browsing — user clicked "add item" while
            // the coupon is being processed. It'll replay and kick off a
            // validation cycle once we're back in browsing.
            //
            // applyCoupon in this state: another coupon attempt while one is
            // already being calculated. Defer it to browsing — it'll replay
            // and kick off another applyingDiscount cycle.
            // ------------------------------------------------------------------
            applyingDiscount: {
                _onEnter({ ctx }) {
                    const duration = DISCOUNT_DURATION_MS * getSpeedMultiplier();
                    ctx.timer = setTimeout(() => {
                        instance.handle(INPUT_DISCOUNT_APPLIED);
                    }, duration);
                },

                _onExit({ ctx }) {
                    if (ctx.timer !== null) {
                        clearTimeout(ctx.timer);
                        ctx.timer = null;
                    }
                },

                discountApplied: "browsing",

                addItem({ defer }) {
                    defer({ until: "browsing" });
                },

                applyCoupon({ defer }) {
                    defer({ until: "browsing" });
                },

                checkout({ defer }) {
                    defer({ until: "browsing" });
                },

                recordPurchaseAnalytics({ defer }) {
                    defer({ until: "checkout" });
                },

                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },

            // ------------------------------------------------------------------
            // reservingInventory — intent chokepoint
            //
            // Once checkout is triggered, we lock down inventory. This is a
            // transient state that only handles the reservation completion
            // and reset. No other inputs are handled or deferred — they emit
            // nohandler and are silently dropped.
            //
            // This is intentional. It demonstrates that even in an FSM that
            // defers frequently, you can have states that act as a one-way
            // gate. The user committed to checkout; the system is working.
            // They can add more items once they reach the checkout state,
            // or reset to start over.
            // ------------------------------------------------------------------
            reservingInventory: {
                _onEnter({ ctx }) {
                    const duration = RESERVATION_DURATION_MS * getSpeedMultiplier();
                    ctx.timer = setTimeout(() => {
                        instance.handle(INPUT_INVENTORY_RESERVED);
                    }, duration);
                },

                _onExit({ ctx }) {
                    if (ctx.timer !== null) {
                        clearTimeout(ctx.timer);
                        ctx.timer = null;
                    }
                },

                inventoryReserved: "checkout",

                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },

            // ------------------------------------------------------------------
            // checkout — review and confirm
            //
            // recordPurchaseAnalytics executes here — this is what all those
            // deferred analytics calls have been waiting for. The key demo
            // moment: fire recordPurchaseAnalytics early, watch it sit in the
            // queue across multiple states, then replay here.
            //
            // addItem kicks back to validating — "oh wait, one more thing"
            // before confirming. The itemCount increments normally.
            //
            // applyCoupon also executes here — it loops back through
            // applyingDiscount and returns to browsing. Unusual UX at this
            // stage, but the FSM handles it cleanly without special cases —
            // which is the point.
            //
            // confirm → confirmed (terminal).
            // ------------------------------------------------------------------
            checkout: {
                addItem({ ctx, emit }) {
                    ctx.itemCount++;
                    emit("itemAdded", { itemCount: ctx.itemCount });
                    return "validating";
                },

                applyCoupon({ emit }) {
                    emit("couponApplied");
                    return "applyingDiscount";
                },

                recordPurchaseAnalytics({ emit }) {
                    emit("analyticsRecorded");
                },

                confirm({ emit }) {
                    emit("orderConfirmed");
                    return "confirmed";
                },

                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },

            // ------------------------------------------------------------------
            // confirmed — terminal state
            //
            // The order is done. Nothing happens here except reset, which
            // starts the demo over.
            // ------------------------------------------------------------------
            confirmed: {
                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },

            // ------------------------------------------------------------------
            // error — NOT WIRED INTO THE DEMO UI
            //
            // This state exists purely to demonstrate the untargeted defer()
            // pattern in source code. It is not reachable from any button click
            // in the demo. To hit it, call fsm.transition("error") directly
            // (e.g., from the browser console).
            //
            // The catch-all "*" handler uses defer() with no argument — no
            // target state. This means the deferred inputs will replay on the
            // NEXT state transition, whatever that transition is. The FSM
            // doesn't know where it's going, so it parks everything and lets
            // the landing state sort it out.
            //
            // In a real implementation, this is where you'd add:
            //   - Exponential back-off logic
            //   - Error classification (transient vs. permanent)
            //   - Diagnostic event emission
            //   - User-facing error reporting
            //
            // For the demo, retry → browsing and reset → browsing are the
            // only ways out.
            // ------------------------------------------------------------------
            error: {
                "*"({ defer }) {
                    // Untargeted defer — the next transition, whatever it is,
                    // will replay these inputs. This is the "park everything"
                    // pattern for when you don't know your recovery target.
                    defer();
                },

                retry: "browsing",

                reset({ ctx }) {
                    ctx.itemCount = 0;
                    return "browsing";
                },
            },
        },
    });

    return instance;
}

// Module-level singleton used by main.ts. The factory closes over its own
// `instance` variable, not this one — this is just the demo's entry point.
// Lazy-initialized by initFsm() so main.ts can supply the speed multiplier getter
// before the FSM is constructed.
let fsm: ReturnType<typeof createShoppingCartFsm>;

/**
 * Initialize the module-level FSM singleton with the UI speed multiplier getter.
 * Called once from main.ts so the FSM is wired to the slider before any events fire.
 */
export function initFsm(
    getSpeedMultiplier: () => number
): ReturnType<typeof createShoppingCartFsm> {
    fsm = createShoppingCartFsm(getSpeedMultiplier);
    return fsm;
}

export { fsm };
