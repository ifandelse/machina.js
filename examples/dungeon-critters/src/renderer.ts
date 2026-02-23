// =============================================================================
// renderer.ts — Canvas 2D drawing for Dungeon Critters
//
// Intentionally supporting cast — this file makes the demo watchable but
// the FSM is the point. Keep drawing code flat and pragmatic.
//
// Drawing order (painter's algorithm, back to front):
//   1. Dungeon floor (tile pattern)
//   2. Sensing radius circles (optional, toggled by UI)
//   3. Critter bodies (state-colored circles)
//   4. Directional "nose" indicators
//   5. Alert "!" indicators
//   6. Flee speed lines
//   7. Selected critter highlight ring
//   8. HUD cursor crosshair
//
// State-to-color lookup: fsm.currentState(critter) → STATE_COLORS lookup.
// The critter client carries no visual state. This matches the build plan's
// explicit design decision and mirrors the traffic intersection's pattern.
// =============================================================================

import type { CritterClient } from "./critter";
import type { BehavioralFsm } from "machina";
import {
    FLOOR_COLOR,
    TILE_COLOR,
    TILE_SIZE,
    TILE_BORDER_COLOR,
    STATE_COLORS,
    STATE_GLOW,
    CHASE_RADIUS_SCALE,
    type CritterState,
} from "./config";

// A dungeon floor tile pattern is generated once and cached as an offscreen
// canvas. Re-creating it every frame would be wasteful; this gets stamped
// across the background each frame via ctx.createPattern().
let _tilePatternCache: CanvasPattern | null = null;

/**
 * Returns a repeating tile pattern for the dungeon floor, generating it on
 * first call and caching it thereafter. The offscreen canvas is 48x48px (TILE_SIZE).
 */
function getTilePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (_tilePatternCache) {
        return _tilePatternCache;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = TILE_SIZE;
    offscreen.height = TILE_SIZE;
    const oc = offscreen.getContext("2d");
    if (!oc) {
        return null;
    }

    // Stone tile: fill the cell, then add a subtle inner bevel and grout line
    oc.fillStyle = TILE_COLOR;
    oc.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Grout lines along right and bottom edges
    oc.strokeStyle = TILE_BORDER_COLOR;
    oc.lineWidth = 1;
    oc.beginPath();
    oc.moveTo(TILE_SIZE - 0.5, 0);
    oc.lineTo(TILE_SIZE - 0.5, TILE_SIZE);
    oc.moveTo(0, TILE_SIZE - 0.5);
    oc.lineTo(TILE_SIZE, TILE_SIZE - 0.5);
    oc.stroke();

    // Subtle top-left highlight (simulates stone bevel)
    oc.strokeStyle = "rgba(255,255,255,0.04)";
    oc.lineWidth = 1;
    oc.beginPath();
    oc.moveTo(0, 0);
    oc.lineTo(TILE_SIZE - 1, 0);
    oc.moveTo(0, 0);
    oc.lineTo(0, TILE_SIZE - 1);
    oc.stroke();

    // Subtle bottom-right shadow
    oc.strokeStyle = "rgba(0,0,0,0.15)";
    oc.beginPath();
    oc.moveTo(TILE_SIZE - 1, 1);
    oc.lineTo(TILE_SIZE - 1, TILE_SIZE - 1);
    oc.moveTo(1, TILE_SIZE - 1);
    oc.lineTo(TILE_SIZE - 1, TILE_SIZE - 1);
    oc.stroke();

    _tilePatternCache = ctx.createPattern(offscreen, "repeat");
    return _tilePatternCache;
}

/** Fills the canvas with the dungeon floor tile pattern. */
function drawFloor(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Base color first, then stamp the tile pattern over it
    ctx.fillStyle = FLOOR_COLOR;
    ctx.fillRect(0, 0, width, height);

    const pattern = getTilePattern(ctx);
    if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
    }
}

/**
 * Draws a faint circle showing the critter's sensing range.
 * Rendered behind critter bodies — only visible when the UI toggle is on.
 */
function drawSensingRadius(ctx: CanvasRenderingContext2D, critter: CritterClient): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(critter.x, critter.y, critter.sensingRange, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

/**
 * Draws a single critter: state-colored body, glow, pulse (idle), nose dot,
 * and delegates to overlay helpers for alert/flee indicators.
 * frameCount drives the idle pulse animation.
 */
function drawCritter(
    ctx: CanvasRenderingContext2D,
    critter: CritterClient,
    state: CritterState,
    frameCount: number
): void {
    const color = STATE_COLORS[state];
    const glow = STATE_GLOW[state];

    ctx.save();

    // Glow / bloom — shadow applied before the body fill
    ctx.shadowColor = glow;
    ctx.shadowBlur = state === "chase" ? 18 : state === "flee" ? 12 : 8;

    // Body — slightly larger for chase to show aggression
    const displayRadius = state === "chase" ? critter.radius * CHASE_RADIUS_SCALE : critter.radius;

    // Idle critters have a subtle pulse (scale oscillation) so the swarm
    // looks alive even when the player is off-screen
    let actualRadius = displayRadius;
    if (state === "idle") {
        const pulse = 1 + Math.sin(frameCount * 0.04 + critter.id * 0.7) * 0.06;
        actualRadius = displayRadius * pulse;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(critter.x, critter.y, actualRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Nose indicator — a small dot in the direction of movement/facing.
    // Threshold must be below the alert state's 0.001 facing-direction signal
    // (vx = dir.dx * 0.001) — otherwise alert critters never show their nose.
    const speed = Math.sqrt(critter.vx * critter.vx + critter.vy * critter.vy);
    if (speed > 0.0001) {
        const nx = critter.vx / speed;
        const ny = critter.vy / speed;
        const noseDist = actualRadius + 3;
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.arc(critter.x + nx * noseDist, critter.y + ny * noseDist, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    // Alert "!" indicator above critter
    if (state === "alert") {
        drawAlertIndicator(ctx, critter, frameCount);
    }

    // Flee speed lines
    if (state === "flee" && critter.fleeDirection) {
        drawSpeedLines(ctx, critter);
    }
}

/**
 * Draws a blinking "!" above alert-state critters.
 * Blink rate is frame-count-based — independent of wall-clock time and system timers.
 */
function drawAlertIndicator(
    ctx: CanvasRenderingContext2D,
    critter: CritterClient,
    frameCount: number
): void {
    // Blink the "!" during the first half of alert — draws attention on entry
    const blinkRate = 12; // frames per blink half-cycle
    const isVisible = Math.floor(frameCount / blinkRate) % 2 === 0;
    if (!isVisible) {
        return;
    }

    ctx.save();
    ctx.font = `bold ${critter.radius + 2}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = STATE_COLORS.alert;
    ctx.shadowColor = STATE_GLOW.alert;
    ctx.shadowBlur = 6;
    ctx.fillText("!", critter.x, critter.y - critter.radius - 4);
    ctx.restore();
}

/**
 * Draws three trailing speed lines behind a fleeing critter.
 * Lines radiate opposite to the flee direction to convey rapid movement.
 */
function drawSpeedLines(ctx: CanvasRenderingContext2D, critter: CritterClient): void {
    if (!critter.fleeDirection) {
        return;
    }

    // Three short lines trailing behind the critter in the flee direction's
    // opposite (i.e., the direction the critter came from).
    const { dx, dy } = critter.fleeDirection;
    // Speed lines point opposite to flee direction (showing where critter was)
    const trailDx = -dx;
    const trailDy = -dy;

    ctx.save();
    ctx.strokeStyle = "rgba(230, 237, 243, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 4; // spread lines perpendicular to trail
        const perpDx = -trailDy;
        const perpDy = trailDx;
        const startDist = critter.radius + 3;
        const endDist = critter.radius + 12 + i * 4;

        const sx = critter.x + trailDx * startDist + perpDx * offset;
        const sy = critter.y + trailDy * startDist + perpDy * offset;
        const ex = critter.x + trailDx * endDist + perpDx * offset;
        const ey = critter.y + trailDy * endDist + perpDy * offset;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
    }

    ctx.restore();
}

/** Draws a dashed blue ring around the currently selected critter. */
function drawSelectionRing(ctx: CanvasRenderingContext2D, critter: CritterClient): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(critter.x, critter.y, critter.radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(88, 166, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// A subtle cursor crosshair so the player can see exactly where they're aiming
function drawCursorCrosshair(
    ctx: CanvasRenderingContext2D,
    cursor: { x: number; y: number },
    onCanvas: boolean
): void {
    if (!onCanvas || cursor.x < 0) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    const arm = 8;
    ctx.beginPath();
    ctx.moveTo(cursor.x - arm, cursor.y);
    ctx.lineTo(cursor.x + arm, cursor.y);
    ctx.moveTo(cursor.x, cursor.y - arm);
    ctx.lineTo(cursor.x, cursor.y + arm);
    ctx.stroke();
    ctx.restore();
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/** Parameters passed to Renderer.draw each frame by the game loop. */
export interface DrawParams {
    critters: CritterClient[];
    fsm: BehavioralFsm<CritterClient, string, string>;
    showSensingRadius: boolean;
    selectedCritter: CritterClient | null;
    cursor: { x: number; y: number };
}

/** Public interface returned by createRenderer. One method — one frame. */
export interface Renderer {
    draw(params: DrawParams): void;
}

/**
 * Creates a canvas renderer for the dungeon critter demo.
 * Owns the 2D context and frame counter; expects draw() to be called once per
 * requestAnimationFrame tick by the game loop in main.ts.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
    const ctx = canvas.getContext("2d")!;
    let frameCount = 0;
    // Track whether cursor is on canvas for the crosshair drawing.
    // main.ts has its own cursorOnCanvas for proximity dispatch — deliberately
    // separate so each module manages its own listener lifecycle.
    let crosshairVisible = false;
    canvas.addEventListener("mouseenter", () => {
        crosshairVisible = true;
    });
    canvas.addEventListener("mouseleave", () => {
        crosshairVisible = false;
    });

    return {
        draw({ critters, fsm, showSensingRadius, selectedCritter, cursor }: DrawParams): void {
            frameCount++;
            const w = canvas.width;
            const h = canvas.height;

            drawFloor(ctx, w, h);

            // Sensing radius circles first (behind critters) — optional
            if (showSensingRadius) {
                for (const critter of critters) {
                    drawSensingRadius(ctx, critter);
                }
            }

            // Critter bodies and overlays
            for (const critter of critters) {
                const state = (fsm.currentState(critter) ?? "idle") as CritterState;
                drawCritter(ctx, critter, state, frameCount);
            }

            // Selection ring on top of critters
            if (selectedCritter) {
                drawSelectionRing(ctx, selectedCritter);
            }

            drawCursorCrosshair(ctx, cursor, crosshairVisible);
        },
    };
}
