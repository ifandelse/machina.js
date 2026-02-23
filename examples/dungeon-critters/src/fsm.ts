// =============================================================================
// fsm.ts — Dungeon Critters Behavioral FSM
//
// Read this file as documentation that happens to execute. The goal: understand
// createBehavioralFsm — one FSM definition, many independent clients, per-client
// state tracked via WeakMap.
//
// Five states, six inputs:
//
//              playerDetected        playerInRange
//   idle ──────────────────► alert ──────────────► chase
//     ▲  ◄──── fidget ────── │  ▲                   │
//     │                      │  │ playerLostContact  │ playerLostContact
//     │   patrol ◄───────────┘  └───────────────────┘
//     ▲     │  ▲
//     │     │  │ playerDetected            attacked
//     │     └──┘                              │
//     │                                       ▼
//     └──────────── flee ◄────────────────── chase
//                    │
//                    └── (timer: FLEE_DURATION_MS) ──► idle
//
// KEY DESIGN DECISIONS (read these before the code):
//
// 1. NO TIMERS IN THE FSM.
//    There are 30–50 critters. 50 independent setTimeout chains would be chaos.
//    Instead, _onEnter records Date.now() on the client, and the tick handler
//    compares elapsed time. One requestAnimationFrame loop drives everything.
//    Granularity is frame-rate-dependent (~16ms) — fine for a demo.
//
// 2. FSM SETS VELOCITY, GAME LOOP INTEGRATES POSITION.
//    Handlers write critter.vx / critter.vy (behavioral intent). The game loop
//    applies (x += vx, y += vy) and clamps to canvas bounds. This keeps FSM
//    handlers focused on "what the critter wants to do," not pixel math.
//
// 3. STATE-TO-COLOR IS LOOKED UP AT RENDER TIME, NOT STORED ON THE CLIENT.
//    The renderer calls fsm.currentState(critter) each frame and maps that to
//    a color. The client carries only behavioral data — no visual state.
//    (fsm.currentState() is a WeakMap lookup — effectively free at 50 critters.)
//
// 4. TICK INPUT CARRIES PLAYER POSITION.
//    The game loop passes { playerX, playerY, dt } as extra args to each tick
//    call. Handlers read these from the second argument to calculate chase/flee
//    direction. This avoids shared mutable state between the game loop and FSM.
//
// 5. LAZY INITIALIZATION.
//    Don't call fsm.transition() or any special init. The first
//    handle(critter, "tick") on frame 1 triggers lazy init into "idle",
//    _onEnter runs, and the tick is handled. Clean and demonstrates the pattern.
//
// BehavioralFsm calling convention:
//   handle(client, inputName, ...args)   — dispatch input to one client
//   currentState(client)                 — WeakMap lookup, returns state name
//   on("*", cb)                          — wildcard event subscription; payload
//                                          includes `client` field for filtering
// =============================================================================

import { createBehavioralFsm } from "machina";
import type { CritterClient } from "./critter";
import {
    IDLE_FIDGET_INTERVAL_MS,
    IDLE_FIDGET_SPEED,
    ALERT_DURATION_MS,
    FLEE_DURATION_MS,
    PATROL_SPEED,
    CHASE_SPEED,
    FLEE_SPEED,
    PATROL_ARRIVAL_THRESHOLD,
} from "./config";

// -----------------------------------------------------------------------------
// TickPayload — extra args passed to every tick handler
//
// The game loop calls: fsm.handle(critter, "tick", payload)
// Handlers receive it as the second argument (after HandlerArgs).
//
// playerX/playerY: cursor position in canvas coords.
// dt: delta-time in milliseconds since the last frame. Currently unused by
//     handlers (they use timestamp comparison for timeouts), but included for
//     future speed normalization if frame rate becomes an issue.
// -----------------------------------------------------------------------------

/**
 * Extra arguments passed to tick (and attacked) handlers by the game loop.
 * Carries player position so handlers can calculate direction without touching
 * shared mutable state outside the FSM.
 */
export interface TickPayload {
    playerX: number;
    playerY: number;
    dt: number;
}

// -----------------------------------------------------------------------------
// Internal helpers — kept private to this module
// -----------------------------------------------------------------------------

/** Euclidean distance between two points */
function distance(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns a unit vector from (ax, ay) toward (bx, by).
 * Returns { dx: 0, dy: 0 } if the points are the same — no division by zero.
 */
function directionTo(ax: number, ay: number, bx: number, by: number): { dx: number; dy: number } {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
        return { dx: 0, dy: 0 };
    }
    return { dx: dx / len, dy: dy / len };
}

/**
 * Picks a random waypoint within the critter's territory circle.
 * Used by patrol._onEnter to set patrolTarget.
 */
function randomWaypointInTerritory(critter: CritterClient): { x: number; y: number } {
    const { cx, cy, r } = critter.territory;
    // Uniform random point in a circle — rejection sampling is simpler and
    // avoids the bias introduced by polar coordinates with linear radius.
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * r;
    return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
    };
}

// -----------------------------------------------------------------------------
// FSM definition
//
// createBehavioralFsm<CritterClient, ...>() — TClient is CritterClient, so
// every handler's `ctx` is a CritterClient. No separate context object needed.
//
// -----------------------------------------------------------------------------

/**
 * Creates the shared BehavioralFsm that drives all critters.
 * One instance handles every critter — per-client state is managed internally
 * via WeakMap. Call handle(critter, inputName) to drive individual critters.
 */
export function createCritterBehavior() {
    return createBehavioralFsm<CritterClient, Record<string, Record<string, unknown>>>({
        id: "critter-behavior",
        initialState: "idle",

        states: {
            // ------------------------------------------------------------------
            // idle — resting, occasionally fidgeting
            //
            // Critters in idle drift with zero velocity and give a small random
            // nudge every IDLE_FIDGET_INTERVAL_MS to keep the swarm alive when
            // the cursor is off-canvas. After enough fidgets they transition to
            // patrol to keep exploring their territory.
            // ------------------------------------------------------------------
            idle: {
                _onEnter({ ctx }) {
                    ctx.vx = 0;
                    ctx.vy = 0;
                    // Record when we started being idle so tick knows when to fidget
                    ctx.fidgetTime = Date.now();
                },

                tick({ ctx }) {
                    // Idle critters don't use player position — proximity inputs
                    // (playerDetected) handle player-reactive behavior. The tick
                    // payload carries player position for chase/flee handlers, not here.

                    // Nudge toward territory center if we've drifted too far.
                    // This prevents critters from permanently migrating after a flee.
                    const distFromHome = distance(ctx.x, ctx.y, ctx.territory.cx, ctx.territory.cy);
                    if (distFromHome > ctx.territory.r) {
                        const dir = directionTo(ctx.x, ctx.y, ctx.territory.cx, ctx.territory.cy);
                        ctx.vx = dir.dx * PATROL_SPEED * 0.5;
                        ctx.vy = dir.dy * PATROL_SPEED * 0.5;
                        return;
                    }

                    // Fidget: apply a small random nudge on interval.
                    // The nudge velocity persists until the NEXT fidget fires, giving
                    // critters a brief drift rather than an invisible no-op. The next
                    // fidget will either apply a new nudge or transition to patrol.
                    // (Zeroing vx/vy here is wrong — the game loop integrates position
                    // AFTER this handler returns, so an immediate zero-out means the
                    // critter never moves. Let the velocity linger instead.)
                    if (
                        ctx.fidgetTime !== null &&
                        Date.now() - ctx.fidgetTime >= IDLE_FIDGET_INTERVAL_MS
                    ) {
                        const angle = Math.random() * Math.PI * 2;
                        ctx.vx = Math.cos(angle) * IDLE_FIDGET_SPEED;
                        ctx.vy = Math.sin(angle) * IDLE_FIDGET_SPEED;
                        ctx.fidgetTime = Date.now();

                        // After fidgeting, there's a chance to transition to patrol.
                        // Random chance keeps it varied rather than mechanically periodic.
                        if (Math.random() < 0.4) {
                            return "patrol";
                        }

                        return;
                    }
                },

                playerDetected: "alert",
            },

            // ------------------------------------------------------------------
            // patrol — moving toward a waypoint within territory
            //
            // _onEnter picks a random waypoint. tick moves toward it. On arrival,
            // picks a new one (up to a small limit) then returns to idle. This
            // keeps patrolling critters visibly wandering without infinite loops.
            // ------------------------------------------------------------------
            patrol: {
                _onEnter({ ctx }) {
                    ctx.patrolTarget = randomWaypointInTerritory(ctx);
                },

                _onExit({ ctx }) {
                    // Clear the patrol target when leaving — chase/flee shouldn't
                    // have a stale waypoint sitting on the client.
                    ctx.patrolTarget = null;
                },

                tick({ ctx }) {
                    if (!ctx.patrolTarget) {
                        return "idle";
                    }

                    const dist = distance(ctx.x, ctx.y, ctx.patrolTarget.x, ctx.patrolTarget.y);

                    if (dist < PATROL_ARRIVAL_THRESHOLD) {
                        // Arrived. Pick a new waypoint with some probability of
                        // returning to idle — keeps the swarm from perpetually patrolling.
                        if (Math.random() < 0.45) {
                            return "idle";
                        }
                        ctx.patrolTarget = randomWaypointInTerritory(ctx);
                        return;
                    }

                    const dir = directionTo(ctx.x, ctx.y, ctx.patrolTarget.x, ctx.patrolTarget.y);
                    ctx.vx = dir.dx * PATROL_SPEED;
                    ctx.vy = dir.dy * PATROL_SPEED;
                },

                playerDetected: "alert",
            },

            // ------------------------------------------------------------------
            // alert — player spotted, deciding what to do
            //
            // The critter faces the player but doesn't move yet. After ALERT_DURATION_MS
            // it will have transitioned to chase (via playerInRange) or back to patrol
            // (via playerLostContact). If it's been alert for too long with neither
            // input, it disengages back to patrol on its own.
            // ------------------------------------------------------------------
            alert: {
                _onEnter({ ctx }) {
                    ctx.vx = 0;
                    ctx.vy = 0;
                    ctx.alertStartedAt = Date.now();
                },

                _onExit({ ctx }) {
                    ctx.alertStartedAt = null;
                },

                tick({ ctx }, payload) {
                    const { playerX = 0, playerY = 0 } = (payload ?? {}) as TickPayload;

                    // Face the player (velocity is zero but direction is tracked
                    // for the nose indicator in the renderer).
                    const dir = directionTo(ctx.x, ctx.y, playerX, playerY);
                    // Store facing direction as a tiny velocity for the renderer to use.
                    // Speed is zero — this is direction-only signaling.
                    ctx.vx = dir.dx * 0.001;
                    ctx.vy = dir.dy * 0.001;

                    // If alert duration expires without a playerInRange or
                    // playerLostContact input, disengage and return to patrol.
                    if (
                        ctx.alertStartedAt !== null &&
                        Date.now() - ctx.alertStartedAt >= ALERT_DURATION_MS
                    ) {
                        return "patrol";
                    }
                },

                // Player got close enough to trigger chase
                playerInRange: "chase",

                // Player left sensing range
                playerLostContact: "patrol",
            },

            // ------------------------------------------------------------------
            // chase — pursuing the player
            //
            // Moves toward the player's position each tick. The game loop passes
            // player position via the TickPayload extra arg. No timer needed —
            // playerLostContact from the game loop handles disengagement.
            // ------------------------------------------------------------------
            chase: {
                tick({ ctx }, payload) {
                    const { playerX = 0, playerY = 0 } = (payload ?? {}) as TickPayload;

                    const dir = directionTo(ctx.x, ctx.y, playerX, playerY);
                    ctx.vx = dir.dx * CHASE_SPEED;
                    ctx.vy = dir.dy * CHASE_SPEED;
                },

                playerLostContact: "alert",

                // Click attack within blast radius triggers flee.
                //
                // We use a function handler (not string shorthand) because flee
                // needs to calculate flee direction from the attack's player position.
                // machina's _onEnter does not receive extra args from the triggering
                // handle() call — so we set fleeDirection here before transitioning.
                // This is an intentional BehavioralFsm pattern: prepare client state
                // in the source-state handler, finalize bookkeeping in _onEnter.
                attacked({ ctx }, payload) {
                    const { playerX, playerY } = payload as TickPayload;

                    // Calculate flee direction NOW while we have the player position.
                    // Away from the player = negate the toward-player vector.
                    const dir = directionTo(ctx.x, ctx.y, playerX, playerY);

                    // If critter and player overlap exactly, directionTo returns {0,0}.
                    // Pick a random direction so the critter actually flees.
                    if (dir.dx === 0 && dir.dy === 0) {
                        const angle = Math.random() * Math.PI * 2;
                        ctx.fleeDirection = { dx: Math.cos(angle), dy: Math.sin(angle) };
                    } else {
                        ctx.fleeDirection = { dx: -dir.dx, dy: -dir.dy };
                    }

                    return "flee";
                },
            },

            // ------------------------------------------------------------------
            // flee — running away from the player
            //
            // _onEnter records the start timestamp (flee direction was already set
            // in chase.attacked, since _onEnter does not receive the extra args from
            // the triggering handle() call — that's a machina design constraint).
            //
            // tick continues moving in the committed flee direction until
            // FLEE_DURATION_MS elapses, then returns to idle.
            //
            // The flee direction is set once in attacked (not recalculated in tick)
            // because a critter that constantly recalculates its flee direction looks
            // jittery. Committed flee direction = more natural, more panicked.
            //
            // _onExit clears fleeDirection and fleeStartedAt — the next state
            // shouldn't inherit these.
            // ------------------------------------------------------------------
            flee: {
                _onEnter({ ctx }) {
                    ctx.fleeStartedAt = Date.now();

                    // fleeDirection was set by chase.attacked before transition.
                    // Apply initial velocity immediately so there's no one-frame pause.
                    if (ctx.fleeDirection) {
                        ctx.vx = ctx.fleeDirection.dx * FLEE_SPEED;
                        ctx.vy = ctx.fleeDirection.dy * FLEE_SPEED;
                    }
                },

                _onExit({ ctx }) {
                    ctx.fleeDirection = null;
                    ctx.fleeStartedAt = null;
                },

                tick({ ctx }) {
                    if (!ctx.fleeDirection) {
                        return "idle";
                    }

                    // Continue in flee direction at full speed
                    ctx.vx = ctx.fleeDirection.dx * FLEE_SPEED;
                    ctx.vy = ctx.fleeDirection.dy * FLEE_SPEED;

                    // Return to idle after flee duration expires
                    if (
                        ctx.fleeStartedAt !== null &&
                        Date.now() - ctx.fleeStartedAt >= FLEE_DURATION_MS
                    ) {
                        return "idle";
                    }
                },
            },
        },
    });
}

export type CritterBehaviorFsm = ReturnType<typeof createCritterBehavior>;
