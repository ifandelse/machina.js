// =============================================================================
// ui.ts — DOM manipulation for the Connectivity Monitor
//
// Three responsibilities, each in its own section:
//   1. Status indicator — swaps CSS classes, updates label and check count
//   2. Event log — appends entries with slide-in animation, auto-scrolls
//   3. Simulation toggle — owns toggle state, fires callback on click
//
// No framework, no virtual DOM. querySelector + classList + textContent.
// The wiring (which FSM event calls which function) lives in main.ts.
// =============================================================================

import "./style.css";

/**
 * Valid state names for the status indicator — mirrored from fsm.ts states.
 * Kept as a local type so ui.ts doesn't import from fsm.ts (no circular dep).
 */
type ConnectivityState = "online" | "offline" | "checking";

const STATE_CLASS_PREFIX = "status-";
const ALL_STATE_CLASSES: ReadonlyArray<string> = [
    `${STATE_CLASS_PREFIX}online`,
    `${STATE_CLASS_PREFIX}offline`,
    `${STATE_CLASS_PREFIX}checking`,
];

// Labels shown in the status text under the indicator.
const STATE_LABELS: Record<ConnectivityState, string> = {
    online: "online",
    offline: "offline",
    checking: "checking...",
};

// =============================================================================
// Status indicator
// =============================================================================

/**
 * Swaps the CSS state class on the indicator and updates the text label.
 * Called from main.ts on every FSM `transitioned` event.
 */
export function renderStatus(state: ConnectivityState): void {
    const indicator = document.getElementById("status-indicator");
    const label = document.getElementById("status-label");

    if (!indicator || !label) {
        return;
    }

    // Remove all state classes first, then apply the new one.
    // This keeps the element clean regardless of what state we came from.
    ALL_STATE_CLASSES.forEach(cls => {
        indicator.classList.remove(cls);
    });
    indicator.classList.add(`${STATE_CLASS_PREFIX}${state}`);

    label.textContent = STATE_LABELS[state];
    label.style.color = getStateColor(state);
}

/**
 * Updates the check count display. Only meaningful when offline or checking.
 * Shows a message when max checks are reached.
 */
export function renderCheckCount(checkCount: number, maxChecks: number): void {
    const el = document.getElementById("status-check");
    if (!el) {
        return;
    }

    if (checkCount >= maxChecks) {
        el.textContent = `max checks reached (${maxChecks})`;
    } else if (checkCount > 0) {
        el.textContent = `check ${checkCount} of ${maxChecks}`;
    } else {
        el.textContent = "";
    }
}

/**
 * Clears the check count display. Called when the FSM returns to "online" so
 * the stale counter doesn't persist into the next offline period.
 */
export function clearCheckCount(): void {
    const el = document.getElementById("status-check");
    if (el) {
        el.textContent = "";
    }
}

// CSS custom property values by state — mirrors the design tokens in style.css.
// These are set directly on the label element so it transitions with the state.
function getStateColor(state: ConnectivityState): string {
    const colorMap: Record<ConnectivityState, string> = {
        online: "var(--color-online)",
        offline: "var(--color-offline)",
        checking: "var(--color-checking)",
    };
    return colorMap[state];
}

// =============================================================================
// Event log
// =============================================================================

/** Data for a single log entry, sourced from the FSM `transitioned` event payload. */
type LogEntryData = {
    inputName: string;
    fromState: string;
    toState: string;
};

/**
 * Appends a new entry to the event log and scrolls it into view.
 * Called from main.ts on every FSM `transitioned` event.
 *
 * Each entry shows: the input received, the transition arrow, and a timestamp.
 * The slide-in animation is handled entirely by CSS (.log-entry keyframe).
 */
export function addLogEntry({ inputName, fromState, toState }: LogEntryData): void {
    const list = document.getElementById("log-list");
    if (!list) {
        return;
    }

    const entry = document.createElement("li");
    entry.className = "log-entry";

    // Input name
    const inputEl = document.createElement("span");
    inputEl.className = "log-entry-input";
    inputEl.textContent = inputName;

    // Transition arrow — e.g. "offline → checking"
    const transitionEl = document.createElement("span");
    transitionEl.className = "log-entry-transition";
    transitionEl.textContent = `${fromState} → ${toState}`;

    // Timestamp — HH:MM:SS
    const timeEl = document.createElement("span");
    timeEl.className = "log-entry-time";
    timeEl.textContent = formatTime(new Date());

    entry.appendChild(inputEl);
    entry.appendChild(transitionEl);
    entry.appendChild(timeEl);

    list.appendChild(entry);

    // Scroll the new entry into view. The CSS mask-image gradient at the top
    // of the list makes this feel natural — new entries slide up from below.
    entry.scrollIntoView({ behavior: "smooth", block: "end" });
}

function formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const s = date.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

// =============================================================================
// Simulation toggle button
// =============================================================================

/** FSM input names the simulation button can fire — same inputs the browser events send. */
type SimulateInputName = "connectionLost" | "connectionRestored";

/** Callback invoked by the simulation button with the input name to dispatch. */
type SimulateCallback = (inputName: SimulateInputName) => void;

const LABEL_SIMULATE_FAILURE = "Simulate Connection Failure";
const LABEL_RESTORE_CONNECTION = "Restore Connection";

/**
 * Wires up the simulation toggle button. The button doesn't know about the
 * FSM — it calls `onToggle` with the input name and the caller decides what
 * to do with it. In main.ts, that's `fsm.handle(inputName)`.
 *
 * Returns a cleanup function to remove the event listener.
 */
export function initSimulateButton(onToggle: SimulateCallback): () => void {
    const btn = document.getElementById("simulate-btn") as HTMLButtonElement | null;
    if (!btn) {
        return () => {};
    }

    let isSimulatingFailure = false;

    function handleClick() {
        isSimulatingFailure = !isSimulatingFailure;

        if (isSimulatingFailure) {
            btn!.textContent = LABEL_RESTORE_CONNECTION;
            btn!.classList.add("simulate-btn--restoring");
            onToggle("connectionLost");
        } else {
            btn!.textContent = LABEL_SIMULATE_FAILURE;
            btn!.classList.remove("simulate-btn--restoring");
            onToggle("connectionRestored");
        }
    }

    btn.addEventListener("click", handleClick);

    // Return cleanup so main.ts can remove the listener on dispose
    return () => {
        btn.removeEventListener("click", handleClick);
    };
}
