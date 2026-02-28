// =============================================================================
// index.ts — Side-effect entry point for machina-test
//
// Importing this module registers all three custom matchers with the global
// `expect` provided by Jest or Vitest. This is the same pattern used by
// @testing-library/jest-dom — the import IS the side effect.
//
// `expect` must be available as a global at the time this module is evaluated.
// Put the import in a test file or in a setup file that runs after the test
// framework's globals are injected.
// =============================================================================

import { toHaveNoUnreachableStates, toAlwaysReach, toNeverReach } from "./matchers";

// Register with the host test runner's global expect
expect.extend({ toHaveNoUnreachableStates, toAlwaysReach, toNeverReach });

// Re-export the options type so consumers can import it alongside the package
export type { ReachabilityOptions } from "./types";
