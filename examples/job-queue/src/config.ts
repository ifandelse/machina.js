// =============================================================================
// config.ts — Job Queue demo constants, types, and configuration
//
// Single source of truth for all state/input names, timing values, job limits,
// and the serialization shape used to persist/restore jobs across page reloads.
//
// The key teaching moment for this example lives in main.ts, but this file
// defines the vocabulary that makes the persist/restore cycle work.
// =============================================================================

import type { ClientSnapshot } from "machina";

// -----------------------------------------------------------------------------
// State names — the five states in the job queue FSM
// -----------------------------------------------------------------------------

export const STATE_QUEUED = "queued";
export const STATE_PROCESSING = "processing";
export const STATE_PAUSED = "paused";
export const STATE_FAILED = "failed";
export const STATE_COMPLETED = "completed";

/**
 * Union of all valid job state names. Used throughout to ensure state strings
 * are constrained to the known set rather than open-ended strings.
 */
export type JobState =
    | typeof STATE_QUEUED
    | typeof STATE_PROCESSING
    | typeof STATE_PAUSED
    | typeof STATE_FAILED
    | typeof STATE_COMPLETED;

// -----------------------------------------------------------------------------
// Input names — user actions and internal FSM tick signals
// -----------------------------------------------------------------------------

export const INPUT_START = "start";
export const INPUT_PAUSE = "pause";
export const INPUT_RESUME = "resume";
export const INPUT_RETRY = "retry";
export const INPUT_TICK = "tick";
// Used to initialize a client in the queued state without side effects.
// Calling fsm.handle(job, INPUT_INITIALIZE) registers the client in the WeakMap
// and fires _onEnter for queued — making currentState() return "queued" before
// the user clicks "Start".
export const INPUT_INITIALIZE = "initialize";

// -----------------------------------------------------------------------------
// Timing and behavior constants
// -----------------------------------------------------------------------------

/** Milliseconds between progress ticks while a job is processing. */
export const STEP_DURATION_MS = 2000;

/**
 * Probability (0–1) that a tick results in a random failure.
 * 0.05 = 5% per tick — enough to occasionally show the failed → retry
 * cycle without making every other job fail.
 */
export const FAILURE_CHANCE = 0.05;

// -----------------------------------------------------------------------------
// Job limits
// -----------------------------------------------------------------------------

/** Maximum number of concurrent jobs. "Add Job" disables at this cap. */
export const MAX_JOBS = 20;

/** Number of steps to complete before a job is considered done. */
export const TOTAL_STEPS = 5;

// -----------------------------------------------------------------------------
// localStorage persistence key
// -----------------------------------------------------------------------------

export const STORAGE_KEY = "machina-job-queue-v1";

// -----------------------------------------------------------------------------
// Display labels
// -----------------------------------------------------------------------------

/** Human-readable display name for each state, shown in job cards. */
export const STATE_LABELS: Record<JobState, string> = {
    [STATE_QUEUED]: "Queued",
    [STATE_PROCESSING]: "Processing",
    [STATE_PAUSED]: "Paused",
    [STATE_FAILED]: "Failed",
    [STATE_COMPLETED]: "Completed",
};

/** Subtitle description for each state, shown beneath the badge. */
export const STATE_DESCRIPTIONS: Record<JobState, string> = {
    [STATE_QUEUED]: "Waiting to start",
    [STATE_PROCESSING]: "Working…",
    [STATE_PAUSED]: "Paused by user",
    [STATE_FAILED]: "Hit an error — retry?",
    [STATE_COMPLETED]: "Done",
};

// -----------------------------------------------------------------------------
// Type definitions
// -----------------------------------------------------------------------------

/**
 * The client object tracked by the BehavioralFsm.
 * All per-job data lives here — the FSM stores state separately in its WeakMap.
 *
 * `timer` is excluded from serialization — setTimeout handles are not
 * serializable, and are re-established after restore via the `resume` input.
 */
export interface JobClient {
    id: number;
    name: string;
    currentStep: number;
    totalSteps: number;
    /** Handle for the repeating tick timer. Never serialized. */
    timer: ReturnType<typeof setTimeout> | null;
    createdAt: string;
    /**
     * Set to true during the rehydrate path in main.ts.
     * The FSM doesn't know or care about this — it's purely a UI hint
     * that causes the "restored" badge to appear on job cards.
     */
    restoredFromStorage: boolean;
}

/**
 * The shape used to serialize a job to localStorage.
 * Excludes `timer` (not serializable) and includes `snapshot` as a sibling field.
 *
 * `snapshot` — a `ClientSnapshot` from `fsm.dehydrate(job)` — is stored
 * alongside, not inside, the client because `rehydrate()` takes it as a
 * separate argument. This mirrors the BehavioralFsm model where state (and
 * any pending deferred inputs) lives in the FSM's own tracking, not on the
 * client object. Using the snapshot form instead of a bare state string is
 * what lets a deferred input — like the pre-emptive `pause` a still-`queued`
 * job can receive (see fsm.ts) — survive a page reload instead of silently
 * vanishing.
 */
export interface PersistedJob {
    snapshot: ClientSnapshot;
    id: number;
    name: string;
    currentStep: number;
    totalSteps: number;
    createdAt: string;
}

/**
 * The top-level shape stored in localStorage under STORAGE_KEY.
 * `nextId` persists the ID counter so restored IDs don't collide with new ones.
 */
export interface StorageShape {
    nextId: number;
    jobs: PersistedJob[];
}
