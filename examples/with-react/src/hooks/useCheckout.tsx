// =============================================================================
// useCheckout.tsx — React integration layer for the checkout FSM
//
// Two exports:
//   CheckoutProvider  — creates the FSM, manages lifecycle, distributes API
//   useCheckout       — hook for consuming components
//
// The integration pattern:
//
// 1. useSyncExternalStore bridges the FSM's event-based API to React's
//    render model. The subscribe function listens to FSM "transitioned" events
//    and calls React's onStoreChange signal. The snapshot is the current state
//    name string.
//
// 2. Context holds a ref to the FSM's context object (same JS reference that
//    the FSM mutates internally). Components read it through the API — because
//    it's the same object, mutations from handlers are always visible. Do NOT
//    spread or clone it.
//
// 3. useMemo wraps the API object so consumers only re-render on state change,
//    not on every parent render.
// =============================================================================

import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useMemo,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { createCheckoutFsm } from "../fsm";
import type { CheckoutContext, CheckoutState } from "../types";

/**
 * The public surface exposed to all consuming components via useCheckout().
 * Wraps the FSM instance so components never import or reference the FSM
 * directly — they just read state, read context, and call handle/canHandle.
 */
export interface CheckoutApi {
    /** Current FSM state name — drives which step component renders. */
    state: CheckoutState;
    /**
     * Reference to the FSM's internal context object. The FSM mutates it;
     * components read it. Re-renders are triggered by state transitions, at
     * which point context is already updated. Do NOT clone or spread this.
     */
    context: CheckoutContext;
    /** Dispatch an input to the FSM. Extra args are forwarded to the handler. */
    handle: (input: string, ...args: unknown[]) => void;
    /**
     * Returns true if the current state has a handler registered for the given
     * input name. Use this to drive button disabled state rather than catching
     * silent no-ops from the FSM.
     */
    canHandle: (input: string) => boolean;
}

const CheckoutApiContext = createContext<CheckoutApi | null>(null);

/** Props for CheckoutProvider — just a children pass-through. */
interface CheckoutProviderProps {
    children: ReactNode;
}

/**
 * Creates and owns the checkout FSM instance for its subtree. Should be placed
 * above any component that calls useCheckout(). The FSM is created once on
 * first render and lives for the lifetime of the Provider — no cleanup is
 * needed because the FSM holds no external resources.
 */
export function CheckoutProvider({ children }: Readonly<CheckoutProviderProps>) {
    // Refs instead of state: initialization runs once, no re-render on setup.
    const fsmRef = useRef<ReturnType<typeof createCheckoutFsm>["fsm"] | null>(null);
    const contextRef = useRef<CheckoutContext | null>(null);

    // Lazy initialization via ref — the FSM is created on first render
    // (component body, not an effect). createCheckoutFsm() returns both the FSM
    // instance and the context object it was given. We hold a reference to the
    // same context the FSM mutates internally, so component reads are always up
    // to date after any transition. Do NOT clone or spread the context — that
    // would break the shared reference.
    if (!fsmRef.current) {
        const { fsm, context } = createCheckoutFsm();
        fsmRef.current = fsm;
        contextRef.current = context;
    }

    // NOTE: No useEffect cleanup / dispose.
    //
    // React 18 StrictMode simulates unmount→remount for effects, but the
    // component body does NOT re-run between the two. If we disposed the FSM
    // in useEffect cleanup, useSyncExternalStore would try to re-subscribe
    // to a dead (or null) FSM during the simulated remount — before the
    // lazy init in the render body gets a chance to recreate it.
    //
    // The FSM is a lightweight in-memory object with no external resources
    // (no network, no DOM, no file handles). When the Provider truly unmounts,
    // the refs become unreachable and the FSM is GC'd. The only dangling
    // reference is paymentProcessing's setTimeout, which resolves harmlessly
    // — handle() on an unreferenced FSM just transitions internally with
    // nobody listening.

    // useSyncExternalStore wires the FSM's event-based state to React's render cycle.
    //
    // subscribe: tell React how to listen for changes. We listen for "transitioned"
    //   events on the FSM and call onStoreChange (React's invalidation signal).
    //   The event payload is discarded — the snapshot function reads the actual state.
    //   Return the cleanup function so React can unsubscribe on unmount.
    //   Wrapped in useCallback with empty deps so React always receives the same
    //   function reference — useSyncExternalStore re-subscribes when subscribe changes.
    //
    // getSnapshot: read the current value. Must be a pure function that returns
    //   the same value if nothing has changed. String primitives satisfy this —
    //   Object.is("foo", "foo") === true, so no spurious re-renders.
    const subscribe = useCallback((onStoreChange: () => void) => {
        const sub = fsmRef.current!.on("transitioned", () => {
            onStoreChange();
        });
        return () => {
            sub.off();
        };
    }, []);

    const state = useSyncExternalStore(
        subscribe,
        () => fsmRef.current!.currentState() as CheckoutState,
        () => "start" as CheckoutState
    );

    // Memoize the API object keyed on state. This means consumers only re-render
    // when the FSM transitions — not on every parent render that re-creates the
    // Provider's JSX output. handle and canHandle are stable function shapes that
    // delegate to fsmRef, so they don't need to be in the deps array.
    const api = useMemo<CheckoutApi>(
        () => ({
            state,
            context: contextRef.current!,
            handle: (input: string, ...args: unknown[]) => {
                fsmRef.current?.handle(input, ...args);
            },
            canHandle: (input: string) => {
                return fsmRef.current?.canHandle(input) ?? false;
            },
        }),
        [state]
    );

    return <CheckoutApiContext.Provider value={api}>{children}</CheckoutApiContext.Provider>;
}

/**
 * Returns the CheckoutApi for the nearest CheckoutProvider. Throws if called
 * outside of a Provider — fail-fast beats a confusing null reference later.
 */
export function useCheckout(): CheckoutApi {
    const api = useContext(CheckoutApiContext);
    if (!api) {
        throw new Error("useCheckout must be used inside a CheckoutProvider");
    }
    return api;
}
