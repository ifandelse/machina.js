// =============================================================================
// ui.ts — Job Queue DOM rendering
//
// Pure DOM manipulation: accepts data, updates the page, returns cleanup fns.
// No FSM knowledge here — this module doesn't import from fsm.ts or config.ts
// (except for types and display labels). All state-specific behavior is driven
// by the state string passed from main.ts.
//
// textContent only — no innerHTML interpolation. All element creation goes
// through createElement + textContent/setAttribute to prevent XSS.
// =============================================================================

import {
    INPUT_PAUSE,
    MAX_JOBS,
    STATE_LABELS,
    STATE_DESCRIPTIONS,
    STATE_QUEUED,
    STATE_PROCESSING,
    STATE_PAUSED,
    STATE_FAILED,
    type JobClient,
    type JobState,
} from "./config";

// -----------------------------------------------------------------------------
// Cached element references — grabbed once at module load
// -----------------------------------------------------------------------------

const getEl = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`ui.ts: missing element #${id} — check index.html`);
    }
    return el as T;
};

// These are referenced in multiple functions, so cache them.
const jobListEl = () => getEl<HTMLDivElement>("job-list");
const addJobBtnEl = () => getEl<HTMLButtonElement>("btn-add-job");

// -----------------------------------------------------------------------------
// Job card creation
// -----------------------------------------------------------------------------

/** Returns the CSS class for a state badge. Each state gets a distinct color. */
const stateBadgeClass = (state: JobState): string => `badge badge--${state}`;

/**
 * Build a contextual action button for a job card based on its current state.
 * Returns null for terminal states where no action is available.
 */
const makeActionButton = (
    job: JobClient,
    state: JobState,
    onAction: (job: JobClient, input: string) => void
): HTMLButtonElement | null => {
    let label: string;
    let input: string;

    if (state === STATE_QUEUED) {
        label = "Start";
        input = "start";
    } else if (state === STATE_PROCESSING) {
        label = "Pause";
        input = "pause";
    } else if (state === STATE_PAUSED) {
        label = "Resume";
        input = "resume";
    } else if (state === STATE_FAILED) {
        label = "Retry";
        input = "retry";
    } else {
        // completed — no action available
        return null;
    }

    const btn = document.createElement("button");
    btn.className = "job-action-btn";
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => onAction(job, input));
    return btn;
};

/**
 * Create a job card DOM element from scratch.
 * Used by renderJobList — updateJobCard handles in-place updates.
 */
const createJobCard = (
    job: JobClient,
    state: JobState,
    onAction: (job: JobClient, input: string) => void
): HTMLDivElement => {
    const card = document.createElement("div");
    card.className = `job-card job-card--${state}`;
    card.dataset.jobId = String(job.id);

    // Header row: job name + restored badge
    const header = document.createElement("div");
    header.className = "job-card__header";

    const name = document.createElement("span");
    name.className = "job-card__name";
    name.textContent = job.name;
    header.appendChild(name);

    if (job.restoredFromStorage) {
        const badge = document.createElement("span");
        badge.className = "job-card__restored-badge";
        badge.textContent = "restored";
        header.appendChild(badge);
    }

    card.appendChild(header);

    // State badge + description
    const stateRow = document.createElement("div");
    stateRow.className = "job-card__state-row";

    const stateBadge = document.createElement("span");
    stateBadge.className = stateBadgeClass(state);
    stateBadge.textContent = STATE_LABELS[state];
    stateRow.appendChild(stateBadge);

    const stateDesc = document.createElement("span");
    stateDesc.className = "job-card__state-desc";
    stateDesc.textContent = STATE_DESCRIPTIONS[state];
    stateRow.appendChild(stateDesc);

    card.appendChild(stateRow);

    // Progress bar — only shown while processing
    if (state === STATE_PROCESSING) {
        const progressWrap = document.createElement("div");
        progressWrap.className = "job-card__progress-wrap";

        // Track: the background container
        const progressTrack = document.createElement("div");
        progressTrack.className = "job-card__progress-bar";

        // Fill: the colored portion, width driven by inline style
        const progressFill = document.createElement("div");
        progressFill.className = "job-card__progress-fill";
        const pct = Math.round((job.currentStep / job.totalSteps) * 100);
        progressFill.style.width = `${pct}%`;

        progressTrack.appendChild(progressFill);

        const progressLabel = document.createElement("span");
        progressLabel.className = "job-card__progress-label";
        progressLabel.textContent = `${job.currentStep} / ${job.totalSteps}`;

        progressWrap.appendChild(progressTrack);
        progressWrap.appendChild(progressLabel);
        card.appendChild(progressWrap);
    }

    // Action button
    const actionBtn = makeActionButton(job, state, onAction);
    if (actionBtn) {
        card.appendChild(actionBtn);
    }

    // Queued jobs get a second, pre-emptive affordance: "Pause on start"
    // defers a pause until the job reaches processing — the deferred input
    // that demonstrates the snapshot round trip (see fsm.ts). Once pending,
    // the button is replaced by a badge: machina has no un-defer, and a
    // second click would just queue a redundant deferral.
    if (state === STATE_QUEUED) {
        if (job.pausePending) {
            const pending = document.createElement("span");
            pending.className = "job-card__pause-pending-badge";
            pending.textContent = "will pause on start";
            card.appendChild(pending);
        } else {
            const pauseBtn = document.createElement("button");
            pauseBtn.className = "job-action-btn job-action-btn--secondary";
            pauseBtn.type = "button";
            pauseBtn.textContent = "Pause on start";
            pauseBtn.title =
                "Defers a pause until the job starts processing — survives a page reload.";
            pauseBtn.addEventListener("click", () => onAction(job, INPUT_PAUSE));
            card.appendChild(pauseBtn);
        }
    }

    return card;
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Render all job cards into the job list container.
 * Replaces the entire list contents — used on initial load and after reset.
 *
 * @param jobs - All active job clients
 * @param states - Map of job ID → current state
 * @param onAction - Called when the user clicks an action button
 */
export const renderJobList = (
    jobs: JobClient[],
    states: Map<number, JobState>,
    onAction: (job: JobClient, input: string) => void
): void => {
    const list = jobListEl();
    list.textContent = "";

    if (jobs.length === 0) {
        renderEmptyState();
        return;
    }

    for (const job of jobs) {
        const state = states.get(job.id) ?? STATE_QUEUED;
        const card = createJobCard(job, state, onAction);
        list.appendChild(card);
    }
};

/**
 * Update a single job card in-place — avoids full list re-render on tick events.
 * Replaces the card's DOM node with a freshly rendered one for the updated state.
 *
 * If the card doesn't exist yet (e.g., first render), this is a no-op — the
 * next renderJobList call will create it.
 */
export const updateJobCard = (
    job: JobClient,
    state: JobState,
    onAction: (job: JobClient, input: string) => void
): void => {
    const list = jobListEl();
    const existing = list.querySelector(`[data-job-id="${job.id}"]`);

    if (!existing) {
        // Job hasn't been rendered yet — nothing to update
        return;
    }

    const updated = createJobCard(job, state, onAction);
    list.replaceChild(updated, existing);
};

/**
 * Show the empty state placeholder when there are no jobs.
 */
export const renderEmptyState = (): void => {
    const list = jobListEl();
    list.textContent = "";

    const empty = document.createElement("div");
    empty.className = "empty-state";

    const msg = document.createElement("p");
    msg.className = "empty-state__message";
    msg.textContent = "No jobs yet. Click Add Job to create one.";
    empty.appendChild(msg);

    const hint = document.createElement("p");
    hint.className = "empty-state__hint";
    hint.textContent = "Start a job and then refresh the page to see rehydrate() in action.";
    empty.appendChild(hint);

    list.appendChild(empty);
};

/**
 * Show the restored-from-storage banner at the top of the page.
 * The banner auto-dismisses after 6 seconds.
 *
 * @param count - Number of jobs restored from localStorage
 */
export const renderRestoredBanner = (count: number): void => {
    const banner = getEl<HTMLDivElement>("restored-banner");
    const text = getEl<HTMLSpanElement>("restored-banner-text");

    text.textContent =
        count === 1
            ? "1 job restored from localStorage."
            : `${count} jobs restored from localStorage.`;

    banner.hidden = false;

    // Auto-dismiss so it doesn't linger forever
    const dismiss = () => {
        banner.hidden = true;
    };

    setTimeout(dismiss, 6000);

    // Also dismiss on click
    banner.addEventListener("click", dismiss, { once: true });
};

/**
 * Wire the "Add Job" button. Returns a cleanup function to remove the listener.
 */
export const initAddJobButton = (onClick: () => void): (() => void) => {
    const btn = addJobBtnEl();
    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
};

/**
 * Wire the "Clear Storage" button. Returns a cleanup function.
 */
export const initClearStorageButton = (onClick: () => void): (() => void) => {
    const btn = getEl<HTMLButtonElement>("btn-clear-storage");
    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
};

/**
 * Enable or disable the "Add Job" button based on whether the job cap is reached.
 * Called whenever a job is added or removed.
 */
export const setAddJobEnabled = (enabled: boolean): void => {
    const btn = addJobBtnEl();
    btn.disabled = !enabled;
    btn.title = enabled ? "" : `Maximum of ${MAX_JOBS} jobs reached.`;
};
