// =============================================================================
// ui.ts — DOM manipulation for the Traffic Intersection example
//
// Three responsibilities:
//   1. State display panel — composite state, parent state, active child, child state
//   2. Event log — scrolling log of FSM events with color coding by type
//   3. Pedestrian request button — fires pedestrianRequest into the FSM
//
// No logic lives here. The wiring (which FSM event calls which function) is in main.ts.
// =============================================================================

import "./style.css";

// =============================================================================
// State display panel
// =============================================================================

/**
 * A point-in-time view of the FSM hierarchy, broken out for display.
 * `activeChild` and `childState` are null when the parent is in a non-delegating
 * state (e.g., clearanceNS, clearanceEW, ready).
 */
export interface StateSnapshot {
    compositeState: string;
    parentState: string;
    // null during clearance phases when no child is active
    activeChild: string | null;
    childState: string | null;
}

/**
 * Updates the state display panel from a snapshot of the current FSM state.
 * Called on every FSM transitioned event.
 */
export function renderStatePanel(snapshot: StateSnapshot): void {
    const compositeEl = document.getElementById("composite-state");
    const parentEl = document.getElementById("parent-state");
    const activeChildEl = document.getElementById("active-child");
    const childStateEl = document.getElementById("child-state");

    if (compositeEl) {
        compositeEl.textContent = snapshot.compositeState;
    }

    if (parentEl) {
        parentEl.textContent = snapshot.parentState;
    }

    if (activeChildEl) {
        activeChildEl.textContent = snapshot.activeChild ?? "none";
    }

    if (childStateEl) {
        childStateEl.textContent = snapshot.childState ?? "—";
    }
}

// =============================================================================
// Event log
// =============================================================================

// Cap the log at 50 entries to prevent DOM bloat. Old entries fall off the top.
const MAX_LOG_ENTRIES = 50;

type LogEventType = "transitioned" | "deferred" | "nohandler" | "handling" | "handled";

/** Data for a single event log row, sourced from FSM event subscriptions in main.ts. */
export interface LogEntryData {
    eventType: LogEventType;
    detail: string;
    timestamp: Date;
}

/**
 * Appends a new event log entry and removes old ones beyond MAX_LOG_ENTRIES.
 * Auto-scrolls to the latest entry.
 */
export function addLogEntry(data: LogEntryData): void {
    const list = document.getElementById("log-list");
    if (!list) {
        return;
    }

    // Trim old entries (oldest are at the end in reverse-chronological order)
    while (list.children.length >= MAX_LOG_ENTRIES) {
        list.removeChild(list.lastChild!);
    }

    const entry = document.createElement("li");
    entry.className = `log-entry log-entry--${data.eventType}`;

    const eventEl = document.createElement("span");
    eventEl.className = "log-entry-event";
    eventEl.textContent = data.eventType;

    const detailEl = document.createElement("span");
    detailEl.className = "log-entry-detail";
    detailEl.textContent = data.detail;

    const timeEl = document.createElement("span");
    timeEl.className = "log-entry-time";
    timeEl.textContent = formatTime(data.timestamp);

    entry.appendChild(eventEl);
    entry.appendChild(detailEl);
    entry.appendChild(timeEl);
    list.prepend(entry);
}

/** Formats a Date as HH:MM:SS for the event log timestamp column. */
function formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const s = date.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

// =============================================================================
// Start button
// =============================================================================

type StartCallback = () => void;

/**
 * Wires up the Start Simulation button.
 * Disables itself after click and enables the pedestrian button.
 * Returns a cleanup function that removes the event listener.
 */
export function initStartButton(onStart: StartCallback): () => void {
    const btn = document.getElementById("start-btn") as HTMLButtonElement | null;
    const pedBtn = document.getElementById("pedestrian-btn") as HTMLButtonElement | null;
    if (!btn) {
        return () => {};
    }

    function handleClick(): void {
        onStart();
        btn!.disabled = true;
        btn!.textContent = "Running";
        if (pedBtn) {
            pedBtn.disabled = false;
        }
    }

    btn.addEventListener("click", handleClick);

    return () => {
        btn.removeEventListener("click", handleClick);
    };
}

// =============================================================================
// Pedestrian request button
// =============================================================================

type PedButtonCallback = () => void;

/**
 * Wires up the pedestrian request button.
 * Returns a cleanup function that removes the event listener.
 *
 * The button gives brief visual feedback on press — a CSS class for 200ms —
 * so the user knows their click registered even during non-interruptible green.
 */
export function initPedestrianButton(onPress: PedButtonCallback): () => void {
    const btn = document.getElementById("pedestrian-btn") as HTMLButtonElement | null;
    if (!btn) {
        return () => {};
    }

    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

    function handleClick(): void {
        onPress();

        // Brief visual feedback — clears itself after 200ms
        btn!.classList.add("btn--pressed");
        if (feedbackTimer !== null) {
            clearTimeout(feedbackTimer);
        }
        feedbackTimer = setTimeout(() => {
            btn!.classList.remove("btn--pressed");
            feedbackTimer = null;
        }, 200);
    }

    btn.addEventListener("click", handleClick);

    return () => {
        btn.removeEventListener("click", handleClick);
        if (feedbackTimer !== null) {
            clearTimeout(feedbackTimer);
        }
    };
}
