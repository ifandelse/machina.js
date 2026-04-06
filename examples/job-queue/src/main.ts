// =============================================================================
// main.ts — Job Queue wiring
//
// This file orchestrates everything: FSM events → UI, DOM events → FSM inputs,
// and the persist/restore cycle that is the purpose of this example.
//
// READ THIS SECTION FIRST — it's the teaching moment:
//
// ON PAGE LOAD:
//   1. Read localStorage.
//   2. For each persisted job, recreate the client object and call:
//        fsm.rehydrate(job, savedState)
//      This silently places the client at its previous state. No _onEnter fires.
//      No events emit. The WeakMap entry is created as if the client had always
//      been in that state.
//   3. For any job that was `processing`, call:
//        fsm.handle(job, "resume")
//      This triggers the `resume` handler in the `processing` state, which
//      restarts the tick timer WITHOUT transitioning. The job picks up where
//      it left off.
//
// That two-step pattern — rehydrate() then handle("resume") — is the whole
// point. rehydrate() is silent by design; the app owns re-establishing
// side effects. This is the canonical machina rehydration pattern.
//
// WIRING ONLY: no business logic here. DOM manipulation goes in ui.ts.
// FSM state machine logic stays in fsm.ts. This file just connects them.
// =============================================================================

import {
    MAX_JOBS,
    STORAGE_KEY,
    STATE_PROCESSING,
    TOTAL_STEPS,
    type JobClient,
    type JobState,
    type PersistedJob,
    type StorageShape,
} from "./config";
import { createJobQueueFsm } from "./fsm";
import {
    renderJobList,
    renderEmptyState,
    renderRestoredBanner,
    updateJobCard,
    initAddJobButton,
    initClearStorageButton,
    setAddJobEnabled,
} from "./ui";

// -----------------------------------------------------------------------------
// App state — kept at module level for event handler closures
// -----------------------------------------------------------------------------

let fsm = createJobQueueFsm();
let jobs: JobClient[] = [];
let nextId = 1;

// Track current state per job ID so ui.ts doesn't need FSM access.
// We maintain this map ourselves on every transitioned event.
const jobStates = new Map<number, JobState>();

// -----------------------------------------------------------------------------
// Serialization helpers
// -----------------------------------------------------------------------------

/**
 * Serialize all active jobs and their current FSM states to localStorage.
 * Called on every `transitioned` event to keep storage fresh.
 *
 * `timer` is excluded — setTimeout handles are not serializable.
 * The timer is re-established via fsm.handle(job, "resume") on restore.
 */
const persistJobs = (): void => {
    const shape: StorageShape = {
        nextId,
        jobs: jobs.map(job => {
            const state = fsm.currentState(job) as JobState;
            const persisted: PersistedJob = {
                state,
                id: job.id,
                name: job.name,
                currentStep: job.currentStep,
                totalSteps: job.totalSteps,
                createdAt: job.createdAt,
            };
            return persisted;
        }),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
};

// -----------------------------------------------------------------------------
// Restore path — the core teaching moment
// -----------------------------------------------------------------------------

/**
 * Attempt to restore jobs from localStorage on page load.
 * Returns the number of jobs restored, or -1 if storage was stale/corrupt.
 *
 * Uses try/catch because rehydrate() throws for unknown state names — this
 * handles the case where a schema change makes old data incompatible.
 */
const restoreFromStorage = (): number => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return 0;
    }

    let shape: StorageShape;
    try {
        shape = JSON.parse(raw) as StorageShape;
    } catch {
        // JSON.parse failed — storage is corrupt
        return -1;
    }

    if (!shape.jobs || !Array.isArray(shape.jobs)) {
        return -1;
    }

    try {
        for (const persisted of shape.jobs) {
            // Reconstruct the client object. timer is excluded from serialization;
            // we set it to null here and re-establish it via "resume" below.
            const job: JobClient = {
                id: persisted.id,
                name: persisted.name,
                currentStep: persisted.currentStep,
                totalSteps: persisted.totalSteps,
                timer: null,
                createdAt: persisted.createdAt,
                // Mark as restored so the UI can show the "restored" badge.
                // The FSM has no concept of this — it's purely a UI hint.
                restoredFromStorage: true,
            };

            // STEP 1: Silently place the client at its saved state.
            // rehydrate() does NOT fire _onEnter, so the tick timer does not start.
            fsm.rehydrate(job, persisted.state);

            jobStates.set(job.id, persisted.state);
            jobs.push(job);

            // STEP 2: If the job was processing, restart its timer.
            // rehydrate() placed it in "processing" but _onEnter didn't fire.
            // The "resume" handler in processing restarts the tick without transitioning.
            if (persisted.state === STATE_PROCESSING) {
                fsm.handle(job, "resume");
            }
        }

        nextId = shape.nextId;
        return jobs.length;
    } catch {
        // rehydrate() threw — saved state names are no longer valid
        // (likely a schema change). Start fresh.
        jobs = [];
        jobStates.clear();
        return -1;
    }
};

// -----------------------------------------------------------------------------
// Action handler — dispatches FSM inputs from UI button clicks
// -----------------------------------------------------------------------------

const handleJobAction = (job: JobClient, input: string): void => {
    fsm.handle(job, input);
};

// -----------------------------------------------------------------------------
// Initialize
// -----------------------------------------------------------------------------

/**
 * Wire up all FSM event subscriptions and DOM event listeners.
 * Called once at page load. Returns a cleanup function for beforeunload.
 */
const init = (): (() => void) => {
    // -------------------------------------------------------------------------
    // Restore from localStorage (before any rendering)
    // -------------------------------------------------------------------------

    const restoredCount = restoreFromStorage();

    if (restoredCount === -1) {
        // Storage was stale or corrupt — wipe it and start fresh
        localStorage.removeItem(STORAGE_KEY);
        console.warn("Job queue: stored data was stale or incompatible — starting fresh.");
    } else if (restoredCount > 0) {
        renderRestoredBanner(restoredCount);
    }

    // -------------------------------------------------------------------------
    // FSM event subscriptions
    // -------------------------------------------------------------------------

    // `transitioned` fires after every state change. This is where we:
    //   1. Update jobStates map so the UI stays in sync.
    //   2. Update the affected job's card.
    //   3. Persist all jobs to localStorage.
    const transitionedSub = fsm.on("transitioned", (data: unknown) => {
        const { client, toState } = data as { client: JobClient; toState: JobState };
        jobStates.set(client.id, toState);
        updateJobCard(client, toState, handleJobAction);
        persistJobs();
    });

    // `handling` subscription for debugging — logs which input is being processed.
    // Matches the pattern in shopping-cart and connectivity examples.
    const handlingSub = fsm.on("handling", (data: unknown) => {
        const { inputName, client } = data as { inputName: string; client: JobClient | undefined };
        console.debug(`[job-queue] handling "${inputName}" for job #${client?.id}`);
    });

    // -------------------------------------------------------------------------
    // DOM event wiring
    // -------------------------------------------------------------------------

    const removeAddJob = initAddJobButton(() => {
        if (jobs.length >= MAX_JOBS) {
            return;
        }

        const job: JobClient = {
            id: nextId++,
            name: `Job #${nextId - 1}`,
            currentStep: 0,
            totalSteps: TOTAL_STEPS,
            timer: null,
            createdAt: new Date().toISOString(),
            restoredFromStorage: false,
        };

        // Register the client in the FSM WeakMap by calling the no-op "initialize"
        // input. This fires _onEnter for "queued" and makes currentState(job)
        // return "queued" before the user clicks Start.
        fsm.handle(job, "initialize");

        jobs.push(job);
        jobStates.set(job.id, "queued");
        persistJobs();

        // Re-render the full list — simpler than trying to insert one card
        // at the right position.
        renderJobList(jobs, jobStates, handleJobAction);
        setAddJobEnabled(jobs.length < MAX_JOBS);
    });

    const removeClearStorage = initClearStorageButton(() => {
        // Dispose the current FSM — clears all subscriptions and timers
        fsm.dispose();

        // Create a fresh FSM and re-subscribe
        fsm = createJobQueueFsm();
        jobs = [];
        jobStates.clear();
        nextId = 1;

        localStorage.removeItem(STORAGE_KEY);

        renderEmptyState();
        setAddJobEnabled(true);

        // Re-wire FSM subscriptions on the new instance
        fsm.on("transitioned", (data: unknown) => {
            const { client, toState } = data as { client: JobClient; toState: JobState };
            jobStates.set(client.id, toState);
            updateJobCard(client, toState, handleJobAction);
            persistJobs();
        });

        fsm.on("handling", (data: unknown) => {
            const { inputName, client } = data as {
                inputName: string;
                client: JobClient | undefined;
            };
            console.debug(`[job-queue] handling "${inputName}" for job #${client?.id}`);
        });
    });

    // -------------------------------------------------------------------------
    // Initial render
    // -------------------------------------------------------------------------

    if (jobs.length === 0) {
        renderEmptyState();
    } else {
        renderJobList(jobs, jobStates, handleJobAction);
    }

    setAddJobEnabled(jobs.length < MAX_JOBS);

    // -------------------------------------------------------------------------
    // Cleanup function — called on beforeunload
    // -------------------------------------------------------------------------

    return () => {
        transitionedSub.off();
        handlingSub.off();
        removeAddJob();
        removeClearStorage();

        // Clear all timers before unload — prevents timer callbacks from
        // firing during the unload sequence and corrupting storage writes.
        for (const job of jobs) {
            if (job.timer !== null) {
                clearTimeout(job.timer);
                job.timer = null;
            }
        }

        fsm.dispose();
    };
};

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------

const cleanup = init();

window.addEventListener("beforeunload", cleanup);
