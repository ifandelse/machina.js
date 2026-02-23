// =============================================================================
// config.ts — Timing, rendering constants, and the FSM-to-renderer bridge.
//
// This file is the single source of truth for:
//   1. Phase timing (green, interruptibleGreen, yellow, clearance durations)
//   2. Rendering geometry (canvas size, road/lane/signal positions)
//   3. The signal state lookup table that maps compositeState() strings to
//      visual states for all four directions.
//
// The lookup table is the explicit contract between fsm.ts and renderer.ts.
// Every compositeState() value the parent FSM can produce MUST have an entry.
// Missing entries throw during development so mistakes fail loudly.
// =============================================================================

// -----------------------------------------------------------------------------
// Phase timing (milliseconds)
//
// These values are passed into createIntersection() in fsm.ts so they're
// testable without reaching into the module. The renderer doesn't know about
// them — only the FSM does.
// -----------------------------------------------------------------------------

/** Non-interruptible portion of the green phase */
export const GREEN_DURATION_MS = 3000;

/** Window during which a pedestrian request can shorten the phase */
export const INTERRUPTIBLE_GREEN_DURATION_MS = 6000;

/** Yellow (caution) interval before going red */
export const YELLOW_DURATION_MS = 2500;

/**
 * All-red clearance interval between phases.
 * The parent FSM holds this timer, not the child. Clear separation: child
 * says "I'm done", parent decides when to start the next phase.
 */
export const CLEARANCE_DURATION_MS = 2750;

// -----------------------------------------------------------------------------
// Canvas geometry
// -----------------------------------------------------------------------------

/** Side length of the square canvas in pixels. */
export const CANVAS_SIZE = 600;
/** Pixel coordinate of the canvas center on both axes. */
export const CANVAS_CENTER = CANVAS_SIZE / 2;

/** Width of each road arm (the paved section vehicles travel on) */
export const ROAD_WIDTH = 160;

/** Width of each painted lane stripe within a road arm */
export const LANE_WIDTH = ROAD_WIDTH / 2;

/** Width of the crosswalk striping area */
export const CROSSWALK_WIDTH = 32;

/** Gap between the intersection edge and the nearest crosswalk stripe */
export const CROSSWALK_MARGIN = 3;

/** Radius of each lens on a traffic signal housing */
export const SIGNAL_LENS_RADIUS = 9;

/** Half-width of the signal housing rectangle */
export const SIGNAL_HOUSING_HALF_W = 13;

// -----------------------------------------------------------------------------
// Signal state vocabulary
//
// Four named states for vehicle signals and three for pedestrian signals.
// The renderer maps these to colors. Using string literals keeps it readable
// without the overhead of a full enum.
// -----------------------------------------------------------------------------

/** The four possible states of a vehicle-facing traffic signal lens. */
export type VehicleSignalState = "green" | "yellow" | "red" | "off";

/**
 * The three possible states of a pedestrian crossing signal.
 * `flashingDontWalk` is the transition warning — crossing in progress is allowed,
 * but starting a new crossing is not.
 */
export type PedSignalState = "walk" | "flashingDontWalk" | "dontWalk";

/** The visual state for all four directions at a given composite state */
export interface SignalStates {
    nsVehicle: VehicleSignalState;
    nsPed: PedSignalState;
    ewVehicle: VehicleSignalState;
    ewPed: PedSignalState;
}

// -----------------------------------------------------------------------------
// Signal color palette
// -----------------------------------------------------------------------------

/**
 * Canonical color values for all rendered signal elements.
 * Centralised here so the renderer never has raw hex strings scattered through it.
 */
export const SIGNAL_COLORS = {
    green: "#3fb950",
    yellow: "#d29922",
    red: "#f85149",
    walk: "#3fb950",
    dontWalk: "#f85149",
    off: "#1a1a2e",
    housingBg: "#1a1a2e",
    housingBorder: "#333",
} as const;

// -----------------------------------------------------------------------------
// Vehicle constants
// All dimensions are in canvas pixels; speeds and accelerations are pixels/frame.
// -----------------------------------------------------------------------------

export const VEHICLE_WIDTH = 28;
export const VEHICLE_HEIGHT = 16;
/** Baseline top speed. Each vehicle gets a random ±25% variation for realism. */
export const VEHICLE_MAX_SPEED = 1.4;
export const VEHICLE_ACCEL = 0.04;
export const VEHICLE_DECEL = 0.06;

// -----------------------------------------------------------------------------
// Pedestrian constants
// All dimensions are in canvas pixels; speeds and accelerations are pixels/frame
// (scaled by 0.005 per-step in updatePedestrian to convert to the t=[0,1] range).
// -----------------------------------------------------------------------------

export const PED_RADIUS = 5;
/** Baseline top speed. Each pedestrian gets a random ±30% variation. */
export const PED_MAX_SPEED = 0.6;
export const PED_ACCEL = 0.03;

// -----------------------------------------------------------------------------
// Signal state lookup table
//
// Maps every compositeState() string the FSM can produce to the visual signal
// state for all four directions. This is the only place in the codebase that
// knows both the FSM state space and the visual representation.
//
// Composite state format: "<parentState>" or "<parentState>.<childState>"
//
// N/S has green during northSouthPhase.*
// E/W has green during eastWestPhase.*
// Both are red during clearanceNS and clearanceEW (all-red interval)
// -----------------------------------------------------------------------------

const LOOKUP_TABLE: Record<string, SignalStates> = {
    // ---- Ready (pre-start, all red) ----

    ready: {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    // ---- North/South active phase ----

    "northSouthPhase.green": {
        nsVehicle: "green",
        nsPed: "walk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    "northSouthPhase.interruptibleGreen": {
        nsVehicle: "green",
        nsPed: "flashingDontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    "northSouthPhase.yellow": {
        nsVehicle: "yellow",
        nsPed: "dontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    "northSouthPhase.red": {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    // ---- N/S clearance (all red) ----

    clearanceNS: {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    // ---- East/West active phase ----

    "eastWestPhase.green": {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "green",
        ewPed: "walk",
    },

    "eastWestPhase.interruptibleGreen": {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "green",
        ewPed: "flashingDontWalk",
    },

    "eastWestPhase.yellow": {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "yellow",
        ewPed: "dontWalk",
    },

    "eastWestPhase.red": {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },

    // ---- E/W clearance (all red) ----

    clearanceEW: {
        nsVehicle: "red",
        nsPed: "dontWalk",
        ewVehicle: "red",
        ewPed: "dontWalk",
    },
};

/**
 * Returns the visual signal states for all four directions given a compositeState() string.
 *
 * Throws in development if the composite state is not in the lookup table —
 * a missing entry means we added an FSM state without a corresponding visual mapping.
 */
export function getSignalStates(compositeState: string): SignalStates {
    // hasOwnProperty guards against prototype chain keys like "constructor", "toString",
    // etc. — a plain `LOOKUP_TABLE[key]` lookup would return the prototype function
    // (truthy) rather than throwing, which would silently corrupt the renderer.
    if (!Object.prototype.hasOwnProperty.call(LOOKUP_TABLE, compositeState)) {
        throw new Error(
            `[traffic-intersection] No signal state mapping for compositeState: "${compositeState}". ` +
                `Add an entry to the LOOKUP_TABLE in config.ts.`
        );
    }
    return LOOKUP_TABLE[compositeState];
}
