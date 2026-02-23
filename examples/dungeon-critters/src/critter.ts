// =============================================================================
// critter.ts — CritterClient type and spawn factory
//
// CritterClient is the "client object" in BehavioralFsm terms: one FSM
// definition tracks per-client state for every critter via WeakMap.
// Everything the FSM handlers need to read or mutate lives here.
//
// Design choices:
//   - Position/velocity are on the client; the game loop owns the integration
//     step (x += vx). The FSM sets intent (velocity), not position.
//   - Timestamps (fidgetTime, alertStartedAt, fleeStartedAt) replace timers.
//     The tick handler compares Date.now() against these instead of managing
//     setInterval/setTimeout per critter. One RAF loop beats 50 timer chains.
//   - territory defines the critter's home range — it patrols within this
//     circle and returns to it after disengaging. Centered on spawn point.
// =============================================================================

import { DEFAULT_SENSING_RANGE, CRITTER_RADIUS_MIN, CRITTER_RADIUS_MAX } from "./config";

export interface CritterClient {
    /** Stable identifier for debugging and event log display */
    id: number;

    /** Canvas position */
    x: number;
    y: number;

    /** Velocity — set by FSM handlers, integrated by game loop */
    vx: number;
    vy: number;

    /** Visual radius (10–15px). Larger = easier to click, more visible */
    radius: number;

    /** Detection radius — how far the critter can "see" the player */
    sensingRange: number;

    /** Home territory — critter patrols within this circle */
    territory: { cx: number; cy: number; r: number };

    /** Current patrol waypoint. Null when idle or not yet assigned */
    patrolTarget: { x: number; y: number } | null;

    /** Flee direction unit vector. Set in chase.attacked, cleared in flee._onExit */
    fleeDirection: { dx: number; dy: number } | null;

    /**
     * Timestamp when the critter last "fidgeted" in idle state.
     * Compared against Date.now() in idle.tick to decide when to nudge.
     */
    fidgetTime: number | null;

    /**
     * Timestamp when the critter entered alert state.
     * alert.tick compares this to decide when to escalate or disengage.
     */
    alertStartedAt: number | null;

    /**
     * Timestamp when the critter entered flee state.
     * flee.tick uses this to decide when to return to idle.
     */
    fleeStartedAt: number | null;
}

/**
 * Canvas dimensions passed to spawnCritters so critters are spawned within
 * the actual visible area, not some hardcoded size.
 */
export interface CanvasBounds {
    width: number;
    height: number;
}

// Counter for unique critter IDs. Module-level so it persists across spawns.
let _nextId = 1;

/**
 * Resets the ID counter — useful in tests to get deterministic IDs.
 * Not part of the public game API.
 */
export function _resetIdCounter(): void {
    _nextId = 1;
}

/**
 * Spawns `count` critters at random positions within `bounds`.
 *
 * Each critter's territory is centered on its spawn point with a radius
 * that keeps it roughly in its home quadrant. Territory radius is slightly
 * smaller than the canvas to prevent border-hugging patrol behavior.
 */
export function spawnCritters(count: number, bounds: CanvasBounds): CritterClient[] {
    const critters: CritterClient[] = [];

    for (let i = 0; i < count; i++) {
        const radius =
            CRITTER_RADIUS_MIN + Math.random() * (CRITTER_RADIUS_MAX - CRITTER_RADIUS_MIN);

        // Spawn within bounds, padded by radius so critters don't start clipping walls
        const padding = radius + 10;
        const x = padding + Math.random() * (bounds.width - padding * 2);
        const y = padding + Math.random() * (bounds.height - padding * 2);

        // Territory radius: 80–150px. Keeps patrol localized but varied.
        // Clamped so territory doesn't extend far beyond the canvas.
        const territoryRadius = 80 + Math.random() * 70;

        critters.push({
            id: _nextId++,
            x,
            y,
            vx: 0,
            vy: 0,
            radius,
            sensingRange: DEFAULT_SENSING_RANGE,
            territory: { cx: x, cy: y, r: territoryRadius },
            patrolTarget: null,
            fleeDirection: null,
            fidgetTime: null,
            alertStartedAt: null,
            fleeStartedAt: null,
        });
    }

    return critters;
}
