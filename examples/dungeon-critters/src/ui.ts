// =============================================================================
// ui.ts — DOM controls panel and per-critter inspector
//
// Three responsibilities:
//   1. Controls panel — sensing range slider, spawn button, sensing radius toggle
//   2. State counts — live critter-per-state tally, updated from main.ts each frame
//   3. Critter inspector — appears when a critter is selected, shows current state
//      badge, recent transition history as colored dots, and live stats
//
// The inspector still uses fsm.on("*") with per-client filtering:
//   fsm.on("*", callback) fires for every critter's every event.
//   The payload always includes `client` — the exact object passed to handle().
//   Filtering by reference identity (===) gives us per-critter streams from
//   a single wildcard subscription. No separate event channel needed.
//
// No framework, no virtual DOM. querySelector + textContent + classList.
// The wiring (which events call which functions) lives in main.ts.
// =============================================================================

import type { CritterClient } from "./critter";
import type { BehavioralFsm } from "machina";
import { type CritterState, INSPECTOR_HISTORY_LENGTH, MAX_CRITTERS } from "./config";

// -----------------------------------------------------------------------------
// State counts panel (updated every frame from main.ts)
// -----------------------------------------------------------------------------

/**
 * Updates the live state count display in the controls panel.
 * Called from main.ts at the end of each frame.
 */
export function updateStateCounts(counts: Record<CritterState, number>): void {
    const states: CritterState[] = ["idle", "patrol", "alert", "chase", "flee"];
    for (const state of states) {
        const el = document.getElementById(`count-${state}`);
        if (el) {
            el.textContent = String(counts[state]);
        }
    }
}

// -----------------------------------------------------------------------------
// Controls panel
// -----------------------------------------------------------------------------

/**
 * Callbacks and shared state passed from main.ts to the UI layer.
 * Keeps ui.ts decoupled from game state — it calls back into main.ts rather
 * than holding direct references to critters or the FSM instance.
 */
export interface ControlsConfig {
    onSensingRangeChange(newRange: number): void;
    onShowSensingToggle(show: boolean): void;
    onSpawn(): void;
    onSelectCritter(critter: CritterClient | null): void;
    getSelectedCritter(): CritterClient | null;
    fsm: BehavioralFsm<CritterClient, string, string>;
    critters: () => CritterClient[];
}

/**
 * Wires up all UI controls and initializes the inspector subscription.
 * Called once from main.ts during startup.
 */
export function initControls(config: ControlsConfig): void {
    wireSensingRangeSlider(config);
    wireSensingCheckbox(config);
    wireSpawnButton(config);
    wireInspector(config);
}

function wireSensingRangeSlider(config: ControlsConfig): void {
    const slider = document.getElementById("sensing-range") as HTMLInputElement | null;
    const valueDisplay = document.getElementById("sensing-range-value");

    if (!slider) {
        return;
    }

    slider.addEventListener("input", () => {
        const newRange = parseInt(slider.value, 10);
        if (valueDisplay) {
            valueDisplay.textContent = String(newRange);
        }
        config.onSensingRangeChange(newRange);
    });
}

function wireSensingCheckbox(config: ControlsConfig): void {
    const checkbox = document.getElementById("show-sensing") as HTMLInputElement | null;
    if (!checkbox) {
        return;
    }

    checkbox.addEventListener("change", () => {
        config.onShowSensingToggle(checkbox.checked);
    });
}

function wireSpawnButton(config: ControlsConfig): void {
    const btn = document.getElementById("spawn-btn") as HTMLButtonElement | null;
    if (!btn) {
        return;
    }

    btn.addEventListener("click", () => {
        config.onSpawn();
        // Disable the button when at max critters
        const critterCount = config.critters().length;
        btn.disabled = critterCount >= MAX_CRITTERS;
        if (critterCount >= MAX_CRITTERS) {
            btn.textContent = "Max critters reached";
        }
    });
}

// -----------------------------------------------------------------------------
// Critter inspector
//
// The BehavioralFsm wildcard subscription fires for every client's every event.
// We filter by reference equality (payload.client === selectedCritter).
// This demonstrates the BehavioralFsm multi-client event model clearly.
//
// Transition history is built from "transitioned" events. Live stats (speed,
// distance, time-in-state) are updated per-frame via updateInspector().
// -----------------------------------------------------------------------------

/** Transition history for the currently selected critter */
let transitionHistory: CritterState[] = [];

/** Timestamp when the selected critter last entered its current state */
let stateEnteredAt: number = Date.now();

/**
 * Sets up the critter inspector panel: subscribes to FSM wildcard events,
 * wires the close button, and monkey-patches config.onSelectCritter to
 * show/hide the panel alongside any selection change from main.ts.
 *
 * The monkey-patch is intentional — it lets canvas clicks (which call
 * onSelectCritter directly) also trigger the inspector without ui.ts
 * needing a separate event channel.
 */
function wireInspector(config: ControlsConfig): void {
    const panel = document.getElementById("critter-inspector");
    const closeBtn = document.getElementById("inspector-close");

    function showPanel(critter: CritterClient): void {
        if (panel) {
            panel.hidden = false;
        }

        const idEl = document.getElementById("inspector-critter-id");
        if (idEl) {
            idEl.textContent = String(critter.id);
        }

        // Reset history for the newly selected critter.
        // Seed with its current state so the strip isn't empty on first click.
        const currentState = config.fsm.currentState(critter) as CritterState | undefined;
        transitionHistory = currentState ? [currentState] : [];
        stateEnteredAt = Date.now();
        renderHistory();
    }

    function hidePanel(): void {
        if (panel) {
            panel.hidden = true;
        }
        transitionHistory = [];
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            config.onSelectCritter(null);
            hidePanel();
        });
    }

    // Subscribe to ALL BehavioralFsm wildcard events.
    // The payload always carries `client` — we use reference equality to filter
    // down to only the selected critter's events. This is the BehavioralFsm
    // multi-client event model: one stream, filter by client reference.
    config.fsm.on("*", (eventName: string, data: unknown) => {
        if (eventName !== "transitioned") {
            return;
        }

        const payload = data as { client?: CritterClient; toState?: string };
        const selected = config.getSelectedCritter();

        // Reference equality: payload.client IS the exact object passed to handle().
        // This is not id comparison — it's the same JS object reference.
        // Demonstrates that BehavioralFsm event payloads carry the actual client.
        if (!selected || payload.client !== selected) {
            return;
        }

        const toState = payload.toState as CritterState | undefined;
        if (!toState) {
            return;
        }

        transitionHistory.push(toState);
        if (transitionHistory.length > INSPECTOR_HISTORY_LENGTH) {
            transitionHistory = transitionHistory.slice(-INSPECTOR_HISTORY_LENGTH);
        }

        stateEnteredAt = Date.now();
        renderHistory();
    });

    // Wrap onSelectCritter so selection changes also update the inspector DOM.
    // main.ts calls onSelectCritter — this intercepts that to show/hide the panel.
    const _originalOnSelectCritter = config.onSelectCritter;
    config.onSelectCritter = (critter: CritterClient | null) => {
        _originalOnSelectCritter(critter);
        if (critter) {
            showPanel(critter);
        } else {
            hidePanel();
        }
    };
}

/**
 * Renders the transition history as colored dots in the inspector panel.
 */
function renderHistory(): void {
    const container = document.getElementById("inspector-history");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    for (let i = 0; i < transitionHistory.length; i++) {
        if (i > 0) {
            const arrow = document.createElement("span");
            arrow.className = "inspector-history-arrow";
            arrow.textContent = "›";
            container.appendChild(arrow);
        }

        const dot = document.createElement("span");
        dot.className = "inspector-history-dot";
        dot.dataset.state = transitionHistory[i];
        dot.title = transitionHistory[i];
        container.appendChild(dot);
    }
}

/**
 * Updates the inspector's live data each frame.
 * Called from the game loop in main.ts — only when a critter is selected.
 */
export function updateInspector(
    critter: CritterClient,
    fsm: BehavioralFsm<CritterClient, string, string>
): void {
    // Current state badge
    const state = (fsm.currentState(critter) ?? "idle") as CritterState;
    const badge = document.getElementById("inspector-state-badge");
    if (badge) {
        badge.textContent = state;
        badge.dataset.state = state;
    }

    // Speed — velocity magnitude
    const speed = Math.sqrt(critter.vx * critter.vx + critter.vy * critter.vy);
    const speedEl = document.getElementById("stat-speed");
    if (speedEl) {
        speedEl.textContent = speed < 0.01 ? "0.0" : speed.toFixed(1);
    }

    // Distance from territory center
    const dx = critter.x - critter.territory.cx;
    const dy = critter.y - critter.territory.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const distEl = document.getElementById("stat-distance");
    if (distEl) {
        distEl.textContent = `${Math.round(dist)}px`;
    }

    // Time in current state
    const elapsed = (Date.now() - stateEnteredAt) / 1000;
    const timeEl = document.getElementById("stat-time");
    if (timeEl) {
        timeEl.textContent = elapsed < 10 ? `${elapsed.toFixed(1)}s` : `${Math.round(elapsed)}s`;
    }
}
