// =============================================================================
// types.ts — Ambient type augmentation for machina-test matchers
//
// Zero runtime code. Augments both Jest and Vitest matcher interfaces so
// that TypeScript recognises the three custom matchers in test files.
//
// Users only ever import "machina-test" — this file is included automatically
// via the triple-slash reference in index.ts.
// =============================================================================

// The options shape for toAlwaysReach / toNeverReach
export interface ReachabilityOptions {
    /** The state to start the BFS from */
    from: string;
}

// Augment Jest matchers
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            /**
             * Asserts that every state in the FSM is reachable from its
             * initialState. Delegates to `inspectGraph` and filters for
             * unreachable-state findings.
             */
            toHaveNoUnreachableStates(): R;

            /**
             * Asserts that a path exists (via BFS over graph edges) from
             * `options.from` to `targetState`.
             */
            toAlwaysReach(targetState: string, options: ReachabilityOptions): R;

            /**
             * Asserts that NO path exists (via BFS over graph edges) from
             * `options.from` to `targetState`.
             */
            toNeverReach(targetState: string, options: ReachabilityOptions): R;
        }
    }
}

// Augment Vitest matchers
declare module "vitest" {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Assertion<T = any> {
        /**
         * Asserts that every state in the FSM is reachable from its
         * initialState. Delegates to `inspectGraph` and filters for
         * unreachable-state findings.
         */
        toHaveNoUnreachableStates(): T;

        /**
         * Asserts that a path exists (via BFS over graph edges) from
         * `options.from` to `targetState`.
         */
        toAlwaysReach(targetState: string, options: ReachabilityOptions): T;

        /**
         * Asserts that NO path exists (via BFS over graph edges) from
         * `options.from` to `targetState`.
         */
        toNeverReach(targetState: string, options: ReachabilityOptions): T;
    }
}
