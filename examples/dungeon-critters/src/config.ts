// =============================================================================
// config.ts — Tuning constants, color palette, and canvas geometry
//
// Single source of truth for every magic number in the game. Change a number
// here to tune the demo without hunting through renderer or game loop code.
// =============================================================================

// -----------------------------------------------------------------------------
// Critter population
// -----------------------------------------------------------------------------

/** Initial critter count on startup */
export const INITIAL_CRITTER_COUNT = 35;

/** Maximum number of critters allowed (UI spawn button respects this cap) */
export const MAX_CRITTERS = 80;

/** Critters added per spawn button press */
export const SPAWN_BATCH_SIZE = 10;

// -----------------------------------------------------------------------------
// Critter geometry
// -----------------------------------------------------------------------------

/** Minimum visual radius (px) */
export const CRITTER_RADIUS_MIN = 10;

/** Maximum visual radius (px) */
export const CRITTER_RADIUS_MAX = 15;

/** Chase state inflates the critter's visual radius by this factor */
export const CHASE_RADIUS_SCALE = 1.18;

// -----------------------------------------------------------------------------
// Sensing / detection thresholds
// -----------------------------------------------------------------------------

/** Default sensing range (px) — how far a critter detects the player */
export const DEFAULT_SENSING_RANGE = 120;

/**
 * Inner detection threshold (px) — within this range, alert critters
 * escalate to chase. Must be less than DEFAULT_SENSING_RANGE.
 */
export const CHASE_RANGE = 60;

/**
 * Blast radius (px) for click-to-attack. Critters within this distance
 * of the click point receive the "attacked" input.
 */
export const ATTACK_BLAST_RADIUS = 80;

// -----------------------------------------------------------------------------
// Timing (milliseconds)
// -----------------------------------------------------------------------------

/** How long the alert state lasts before auto-disengaging to patrol */
export const ALERT_DURATION_MS = 2500;

/** How long flee lasts before returning to idle */
export const FLEE_DURATION_MS = 2000;

/** Interval between idle fidgets */
export const IDLE_FIDGET_INTERVAL_MS = 1800;

// -----------------------------------------------------------------------------
// Speeds (pixels per frame at 60fps)
// -----------------------------------------------------------------------------

/** Patrol movement speed */
export const PATROL_SPEED = 0.8;

/** Chase movement speed */
export const CHASE_SPEED = 1.6;

/** Flee movement speed */
export const FLEE_SPEED = 2.2;

/** Idle fidget nudge speed (small random impulse, then stops) */
export const IDLE_FIDGET_SPEED = 0.6;

/** Distance threshold for "arrived at patrol waypoint" */
export const PATROL_ARRIVAL_THRESHOLD = 8;

// -----------------------------------------------------------------------------
// Color palette — state-to-color lookup used by the renderer
//
// Looked up at render time via fsm.currentState(critter), NOT stored on client.
// This is the explicit contract between fsm.ts states and renderer.ts visuals.
// -----------------------------------------------------------------------------

export type CritterState = "idle" | "patrol" | "alert" | "chase" | "flee";

export const STATE_COLORS: Record<CritterState, string> = {
    idle: "#5a6a7a", // dim blue-grey — resting, not a threat
    patrol: "#3fb950", // green — active but calm
    alert: "#d29922", // amber — on guard, watching
    chase: "#f85149", // red — actively pursuing
    flee: "#e6edf3", // near-white — panicked, running
};

/** Glow color for each state (used for the critter's shadow/bloom) */
export const STATE_GLOW: Record<CritterState, string> = {
    idle: "rgba(90, 106, 122, 0.3)",
    patrol: "rgba(63, 185, 80, 0.35)",
    alert: "rgba(210, 153, 34, 0.45)",
    chase: "rgba(248, 81, 73, 0.5)",
    flee: "rgba(230, 237, 243, 0.4)",
};

// -----------------------------------------------------------------------------
// Dungeon floor visual constants
// -----------------------------------------------------------------------------

/** Dungeon floor background color */
export const FLOOR_COLOR = "#0d1117";

/** Stone tile color (slightly lighter than floor) */
export const TILE_COLOR = "#161b22";

/** Tile grid size (px) */
export const TILE_SIZE = 48;

/** Tile border/grout color */
export const TILE_BORDER_COLOR = "#1f2937";

// -----------------------------------------------------------------------------
// UI panel constants
// -----------------------------------------------------------------------------

/** Number of recent transitions shown in the critter inspector history strip */
export const INSPECTOR_HISTORY_LENGTH = 8;
