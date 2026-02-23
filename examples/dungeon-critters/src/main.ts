// =============================================================================
// main.ts — Game loop orchestrator. Wiring only.
//
// This file connects: FSM, critters, renderer, UI, and the input dispatch loop.
// No FSM logic here (lives in fsm.ts), no rendering (lives in renderer.ts),
// no DOM manipulation (lives in ui.ts).
//
// Frame sequence (see comment in the loop body for detail):
//   1. Read cursor position
//   2. Dispatch proximity inputs per critter
//   3. Dispatch tick to all critters (with player position)
//   4. Physics integration (apply velocity, clamp bounds)
//   5. Render
//   6. Update UI state counts
//
// Reading order:
//   1. fsm.ts — the BehavioralFsm definition (the point of the example)
//   2. critter.ts — CritterClient type and factory
//   3. config.ts — tuning constants
//   4. renderer.ts — canvas drawing
//   5. ui.ts — DOM controls and event log
//   6. main.ts — wiring (this file)
// =============================================================================

import "./style.css";
import { createCritterBehavior } from "./fsm";
import { spawnCritters, type CritterClient } from "./critter";
import { createRenderer } from "./renderer";
import { initControls, updateStateCounts, updateInspector } from "./ui";
import {
    INITIAL_CRITTER_COUNT,
    MAX_CRITTERS,
    SPAWN_BATCH_SIZE,
    DEFAULT_SENSING_RANGE,
    CHASE_RANGE,
    ATTACK_BLAST_RADIUS,
    CHASE_RADIUS_SCALE,
    type CritterState,
} from "./config";

// -----------------------------------------------------------------------------
// Canvas setup
// -----------------------------------------------------------------------------

const canvas = document.getElementById("dungeon-canvas") as HTMLCanvasElement | null;
if (!canvas) {
    throw new Error("[dungeon-critters] Canvas element #dungeon-canvas not found");
}

// Set canvas to viewport size before spawning critters so they get the real bounds.
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

/**
 * Resizes the canvas to the current viewport and rescales critter positions
 * and territory centers proportionally. Without proportional rescaling,
 * critters pile up at the old edge on shrink or ignore new space on expand.
 */
function resizeCanvas(): void {
    const oldW = canvas!.width;
    const oldH = canvas!.height;
    canvas!.width = window.innerWidth;
    canvas!.height = window.innerHeight;

    if (oldW > 0 && oldH > 0) {
        const scaleX = canvas!.width / oldW;
        const scaleY = canvas!.height / oldH;

        for (const critter of critters) {
            const pad = critter.radius;
            critter.x = Math.max(pad, Math.min(critter.x * scaleX, canvas!.width - pad));
            critter.y = Math.max(pad, Math.min(critter.y * scaleY, canvas!.height - pad));
            critter.territory.cx = Math.max(
                pad,
                Math.min(critter.territory.cx * scaleX, canvas!.width - pad)
            );
            critter.territory.cy = Math.max(
                pad,
                Math.min(critter.territory.cy * scaleY, canvas!.height - pad)
            );
        }
    }
}

// -----------------------------------------------------------------------------
// FSM instance — main.ts owns the lifecycle
// -----------------------------------------------------------------------------

const fsm = createCritterBehavior();

// -----------------------------------------------------------------------------
// Game state
// -----------------------------------------------------------------------------

let critters: CritterClient[] = spawnCritters(INITIAL_CRITTER_COUNT, {
    width: canvas.width,
    height: canvas.height,
});

// Register after critters exist so resizeCanvas can iterate them.
window.addEventListener("resize", resizeCanvas);

/** Mouse/cursor position in canvas coordinates */
const cursor = { x: -9999, y: -9999 };

// Track when the cursor entered the canvas so we don't fire playerDetected
// on critters before the mouse has actually moved over the canvas.
let cursorOnCanvas = false;

/** Currently selected critter for the event log panel (null = none) */
let selectedCritter: CritterClient | null = null;

/**
 * Shared selection setter used by both handleCanvasClick and initControls.
 * Populated after initControls runs — by that point wireEventLog has patched
 * config.onSelectCritter to also show/hide the event log panel. Routing all
 * selection changes through this one call ensures the log panel always reacts.
 */
let selectCritter: (critter: CritterClient | null) => void = critter => {
    // Fallback used before initControls runs (should not happen in practice).
    selectedCritter = critter;
};

// Whether to draw sensing radius circles (toggled by UI checkbox)
let showSensingRadius = false;

// The sensing range that new spawns will use (updated by UI slider)
let currentSensingRange = DEFAULT_SENSING_RANGE;

// -----------------------------------------------------------------------------
// Renderer
// -----------------------------------------------------------------------------

const renderer = createRenderer(canvas);

// -----------------------------------------------------------------------------
// Input dispatch helpers
// -----------------------------------------------------------------------------

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    return dx * dx + dy * dy;
}

/**
 * Dispatches proximity-based inputs to each critter based on cursor distance.
 *
 * The game loop knows who's in range — the FSM doesn't. This avoids having
 * the FSM poll shared state and keeps handlers focused on behavioral logic.
 *
 * Input dispatch rules:
 *   - Within sensingRange, not yet alert/chase/flee → playerDetected
 *   - Within chaseRange, currently alert → playerInRange (escalate to chase)
 *   - Outside sensingRange, currently alert or chase → playerLostContact
 */
function dispatchProximityInputs(): void {
    if (!cursorOnCanvas) {
        return;
    }

    for (const critter of critters) {
        const state = fsm.currentState(critter);
        // Compare squared distances to avoid sqrt — pre-square the thresholds
        const dSq = distanceSq(critter.x, critter.y, cursor.x, cursor.y);
        const sensingRangeSq = critter.sensingRange * critter.sensingRange;
        const chaseRangeSq = CHASE_RANGE * CHASE_RANGE;

        if (dSq <= sensingRangeSq) {
            // Player is within sensing range
            if (state === "idle" || state === "patrol") {
                fsm.handle(critter, "playerDetected");
            } else if (state === "alert" && dSq <= chaseRangeSq) {
                fsm.handle(critter, "playerInRange");
            }
        } else {
            // Player is outside sensing range
            if (state === "alert" || state === "chase") {
                fsm.handle(critter, "playerLostContact");
            }
        }
    }
}

/**
 * Dispatches tick to every critter with the current player position.
 * Player position is passed as extra args (TickPayload) so FSM handlers
 * can calculate movement direction without accessing shared state.
 */
function dispatchTick(dt: number): void {
    const payload = { playerX: cursor.x, playerY: cursor.y, dt };
    for (const critter of critters) {
        fsm.handle(critter, "tick", payload);
    }
}

/**
 * Physics integration step — applies velocity to position and clamps to canvas.
 * Lives in the game loop, not the FSM. The FSM sets intent (velocity);
 * the loop applies it. This keeps boundary logic out of FSM handlers.
 */
function integratePhysics(): void {
    const w = canvas!.width;
    const h = canvas!.height;

    for (const critter of critters) {
        critter.x += critter.vx;
        critter.y += critter.vy;

        // Clamp to canvas bounds with a padding equal to the critter's radius.
        // Don't fire an FSM input on wall contact — boundary is a physics concern.
        const pad = critter.radius;
        if (critter.x < pad) {
            critter.x = pad;
            critter.vx = 0;
        } else if (critter.x > w - pad) {
            critter.x = w - pad;
            critter.vx = 0;
        }
        if (critter.y < pad) {
            critter.y = pad;
            critter.vy = 0;
        } else if (critter.y > h - pad) {
            critter.y = h - pad;
            critter.vy = 0;
        }
    }
}

// -----------------------------------------------------------------------------
// Attack dispatch (on canvas click)
// -----------------------------------------------------------------------------

/**
 * On click: find all critters within ATTACK_BLAST_RADIUS of the click point
 * and dispatch "attacked" to each. Also: if the click is directly on a critter
 * (within its visual radius), select it for the event log.
 *
 * Selection and attack are not mutually exclusive — you can watch a critter's
 * event log while also blasting it.
 */
function handleCanvasClick(event: MouseEvent): void {
    const clickX = event.clientX;
    const clickY = event.clientY;

    let hitCritter: CritterClient | null = null;
    const blastSq = ATTACK_BLAST_RADIUS * ATTACK_BLAST_RADIUS;

    for (const critter of critters) {
        const dSq = distanceSq(critter.x, critter.y, clickX, clickY);
        const state = fsm.currentState(critter) as CritterState;

        // Selection: click must be within the critter's visual circle.
        // Chase-state critters render inflated, so the hit-test must match.
        const hitRadius = state === "chase" ? critter.radius * CHASE_RADIUS_SCALE : critter.radius;
        if (dSq <= hitRadius * hitRadius && !hitCritter) {
            hitCritter = critter;
        }

        // Attack: within blast radius (larger than visual, for satisfying scatter)
        if (dSq <= blastSq) {
            // "attacked" only makes sense in chase (per the state diagram).
            // Other states don't handle it — they'd emit nohandler. That's fine
            // for a demo, but we filter here to keep the event log cleaner.
            if (state === "chase") {
                fsm.handle(critter, "attacked", { playerX: clickX, playerY: clickY, dt: 0 });
            }
        }
    }

    // Sticky selection: only change selection when clicking directly on a critter.
    // Clicking empty canvas to attack shouldn't deselect — use the inspector's
    // close button to deselect instead. This lets you watch a critter flee after
    // attacking it without losing the inspector.
    if (hitCritter) {
        selectCritter(hitCritter);
    }
}

canvas.addEventListener("click", handleCanvasClick);

// Track whether cursor is on canvas for the playerDetected proximity check
canvas.addEventListener("mouseenter", () => {
    cursorOnCanvas = true;
});
canvas.addEventListener("mouseleave", () => {
    cursorOnCanvas = false;
    // Proximity dispatch skips entirely when cursorOnCanvas is false, so alert/chase
    // critters would never receive playerLostContact and stay stuck indefinitely.
    // Dispatch it immediately to all critters that need it on the way out.
    for (const critter of critters) {
        const state = fsm.currentState(critter);
        if (state === "alert" || state === "chase") {
            fsm.handle(critter, "playerLostContact");
        }
    }
});

canvas.addEventListener("mousemove", (event: MouseEvent) => {
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    // Also mark cursor as on-canvas here. If the canvas appears under an
    // already-positioned cursor (e.g. loaded in an iframe), mouseenter never
    // fires — but mousemove will, and that's just as authoritative.
    cursorOnCanvas = true;
});

// -----------------------------------------------------------------------------
// RAF game loop
// -----------------------------------------------------------------------------

let lastTime: number | null = null;
let rafId = 0;

/**
 * Main requestAnimationFrame callback. Runs one game tick:
 * proximity input dispatch → tick dispatch → physics → render → UI update.
 * Order matters — see header comment for the full frame sequence.
 */
function frame(timestamp: number): void {
    const dt = lastTime === null ? 16 : timestamp - lastTime;
    lastTime = timestamp;

    // --- Input dispatch ---
    // Order matters: proximity inputs fire first so the FSM is in the correct
    // state before tick handlers run and calculate movement direction.
    dispatchProximityInputs();
    dispatchTick(dt);

    // --- Physics ---
    integratePhysics();

    // --- Render ---
    renderer.draw({
        critters,
        fsm,
        showSensingRadius,
        selectedCritter,
        cursor,
    });

    // --- Inspector live data ---
    if (selectedCritter) {
        updateInspector(selectedCritter, fsm);
    }

    // --- UI state counts ---
    // Iterate critters, tally currentState() per critter.
    // This is O(n) with n WeakMap lookups per frame — sub-millisecond at 50 critters.
    const counts: Record<CritterState, number> = {
        idle: 0,
        patrol: 0,
        alert: 0,
        chase: 0,
        flee: 0,
    };
    for (const critter of critters) {
        const state = fsm.currentState(critter) as CritterState | undefined;
        if (state && Object.prototype.hasOwnProperty.call(counts, state)) {
            counts[state]++;
        }
    }
    updateStateCounts(counts);

    rafId = requestAnimationFrame(frame);
}

rafId = requestAnimationFrame(frame);

// -----------------------------------------------------------------------------
// UI controls wiring
// -----------------------------------------------------------------------------

const controlsConfig = {
    onSensingRangeChange(newRange: number) {
        currentSensingRange = newRange;
        for (const critter of critters) {
            critter.sensingRange = newRange;
        }
    },

    onShowSensingToggle(show: boolean) {
        showSensingRadius = show;
    },

    onSpawn() {
        if (critters.length >= MAX_CRITTERS) {
            return;
        }
        const toSpawn = Math.min(SPAWN_BATCH_SIZE, MAX_CRITTERS - critters.length);
        const newCritters = spawnCritters(toSpawn, {
            width: canvas!.width,
            height: canvas!.height,
        });
        // Apply current sensing range to new spawns
        for (const c of newCritters) {
            c.sensingRange = currentSensingRange;
        }
        critters = critters.concat(newCritters);
    },

    onSelectCritter(critter: CritterClient | null) {
        selectedCritter = critter;
    },

    getSelectedCritter() {
        return selectedCritter;
    },

    fsm,
    critters: () => critters,
};

initControls(controlsConfig);

// After initControls returns, wireEventLog has patched controlsConfig.onSelectCritter
// to also show/hide the event log panel. Point selectCritter at the patched version
// so canvas clicks also trigger the panel, not just calls from the UI close button.
// The patched version calls the original (which sets selectedCritter) and then
// shows/hides the log panel — no redundant assignment needed here.
selectCritter = (critter: CritterClient | null) => {
    controlsConfig.onSelectCritter(critter);
};

// -----------------------------------------------------------------------------
// Cleanup on page unload
// -----------------------------------------------------------------------------

/** Cancels the RAF loop and disposes the FSM to release WeakMap entries on page unload. */
function handleBeforeUnload(): void {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resizeCanvas);
    fsm.dispose();
}

globalThis.addEventListener("beforeunload", handleBeforeUnload);
