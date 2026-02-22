// =============================================================================
// renderer.ts — Canvas 2D intersection renderer
//
// Draws the static intersection geometry, traffic signal housings, vehicle
// sprites, and pedestrian figures. The FSM drives everything — this file just
// reads compositeState() each frame and looks up the visual state via config.
//
// Intentionally kept flat and pragmatic. This is supporting cast, not the star.
// If a drawing detail starts feeling clever, simplify it.
//
// Drawing order (painter's algorithm, back to front):
//   1. Ground / road surface
//   2. Lane markings and crosswalk stripes
//   3. Stop lines
//   4. Vehicles (behind signals)
//   5. Pedestrians (behind signal housings)
//   6. Traffic signal housings + lenses
//   7. Crosswalk signal housings + indicators
// =============================================================================

import {
    CANVAS_SIZE,
    CANVAS_CENTER,
    ROAD_WIDTH,
    LANE_WIDTH,
    CROSSWALK_WIDTH,
    CROSSWALK_MARGIN,
    SIGNAL_LENS_RADIUS,
    SIGNAL_HOUSING_HALF_W,
    SIGNAL_COLORS,
    VEHICLE_WIDTH,
    VEHICLE_HEIGHT,
    VEHICLE_MAX_SPEED,
    VEHICLE_ACCEL,
    VEHICLE_DECEL,
    PED_RADIUS,
    PED_MAX_SPEED,
    PED_ACCEL,
    getSignalStates,
    type VehicleSignalState,
    type PedSignalState,
    type SignalStates,
} from "./config";

// -----------------------------------------------------------------------------
// Color palette for the road environment
// -----------------------------------------------------------------------------

const ROAD_COLOR = "#2a2a2a";
const GROUND_COLOR = "#1a1a1a";
const LANE_STRIPE_COLOR = "#555";
const CROSSWALK_STRIPE_COLOR = "#666";
const STOP_LINE_COLOR = "#888";

// Half-width of the road, used everywhere for positioning
const ROAD_HALF = ROAD_WIDTH / 2;

// Gap between queued vehicles (bumper to bumper spacing)
const VEHICLE_FOLLOW_GAP = 6;

// Crosswalk stripe zone, sitting just outside the intersection box on each arm.
// CW_NEAR = edge closer to canvas edge; CW_FAR = edge closer to intersection center.
const CW_NEAR = CANVAS_CENTER - ROAD_HALF - CROSSWALK_MARGIN - CROSSWALK_WIDTH;
const CW_FAR = CW_NEAR + CROSSWALK_WIDTH;

// -----------------------------------------------------------------------------
// Vehicle type and spawn configuration
// -----------------------------------------------------------------------------

type Direction = "north" | "south" | "east" | "west";

interface Vehicle {
    direction: Direction;
    // Position along the road axis (0 = top/left of canvas, CANVAS_SIZE = bottom/right)
    pos: number;
    speed: number;
    maxSpeed: number;
    // Color for the car body
    color: string;
    // Slight randomization prevents lockstep movement
    accelJitter: number;
}

const VEHICLE_COLORS = ["#4a90d9", "#e84393", "#f0a500", "#7ed321", "#9b59b6", "#e67e22"];

// Stop positions per direction — where vehicles must stop at red.
// The vehicle sprite is centred on `pos`, so the front bumper is at
// pos ± VEHICLE_HEIGHT/2 depending on travel direction.
//
// North/east approach from low coordinates → front bumper at pos + VEHICLE_HEIGHT/2.
// They must stop before CW_NEAR (the canvas-edge side of the crosswalk).
//
// South/west approach from high coordinates → front bumper at pos - VEHICLE_HEIGHT/2.
// They must stop before CANVAS_SIZE - CW_NEAR (the canvas-edge side of the far crosswalk).
const STOP_POS: Record<Direction, number> = {
    north: CW_NEAR - VEHICLE_HEIGHT - 2,
    south: CANVAS_SIZE - CW_NEAR + VEHICLE_HEIGHT + 2,
    east: CW_NEAR - VEHICLE_HEIGHT - 2,
    west: CANVAS_SIZE - CW_NEAR + VEHICLE_HEIGHT + 2,
};

// Entry positions — where vehicles reappear after wrapping
const ENTRY_POS: Record<Direction, number> = {
    north: -VEHICLE_HEIGHT * 2,
    south: CANVAS_SIZE + VEHICLE_HEIGHT * 2,
    east: -VEHICLE_HEIGHT * 2,
    west: CANVAS_SIZE + VEHICLE_HEIGHT * 2,
};

// Exit positions — when a vehicle crosses this threshold it wraps
const EXIT_POS: Record<Direction, number> = {
    north: CANVAS_SIZE + VEHICLE_HEIGHT * 2,
    south: -VEHICLE_HEIGHT * 2,
    east: CANVAS_SIZE + VEHICLE_HEIGHT * 2,
    west: -VEHICLE_HEIGHT * 2,
};

// Movement direction multiplier (+1 or -1)
const MOVE_DIR: Record<Direction, number> = {
    north: 1, // travels downward in canvas coords (south on screen)
    south: -1, // travels upward in canvas coords (north on screen)
    east: 1, // travels rightward
    west: -1, // travels leftward
};

// Which axis this direction travels on
const IS_VERTICAL: Record<Direction, boolean> = {
    north: true,
    south: true,
    east: false,
    west: false,
};

// Which lateral position (center of the lane) each direction uses
const LANE_CENTER: Record<Direction, number> = {
    north: CANVAS_CENTER - LANE_WIDTH / 2, // right-side driving, left lane
    south: CANVAS_CENTER + LANE_WIDTH / 2, // right-side driving, right lane
    east: CANVAS_CENTER + LANE_WIDTH / 2,
    west: CANVAS_CENTER - LANE_WIDTH / 2,
};

/** Creates a vehicle with randomised speed and color for variety in the simulation. */
function makeVehicle(direction: Direction, startPos: number): Vehicle {
    const colorIdx = Math.floor(Math.random() * VEHICLE_COLORS.length);
    return {
        direction,
        pos: startPos,
        speed: 0,
        maxSpeed: VEHICLE_MAX_SPEED * (0.75 + Math.random() * 0.5),
        color: VEHICLE_COLORS[colorIdx],
        accelJitter: 0.85 + Math.random() * 0.3,
    };
}

/**
 * Spawns 4 vehicles per direction, queued behind the stop line so the
 * intersection starts in a realistic "waiting at red" state.
 */
function spawnVehicles(): Vehicle[] {
    const vehicles: Vehicle[] = [];
    const dirs: Direction[] = ["north", "south", "east", "west"];
    for (const dir of dirs) {
        const stop = STOP_POS[dir];
        const moveDir = MOVE_DIR[dir];
        // 4 vehicles per direction, queued behind the stop line
        for (let i = 0; i < 4; i++) {
            const gap = (VEHICLE_HEIGHT + 10) * (i + 1);
            vehicles.push(makeVehicle(dir, stop - gap * moveDir));
        }
    }
    return vehicles;
}

/** Maps a driving direction to the appropriate vehicle signal state from the current snapshot. */
function vehicleSignalForDirection(dir: Direction, signals: SignalStates): VehicleSignalState {
    if (dir === "north" || dir === "south") {
        return signals.nsVehicle;
    }
    return signals.ewVehicle;
}

// -----------------------------------------------------------------------------
// Queue-aware vehicle positioning
//
// Each frame, we figure out where every vehicle's nearest same-direction
// predecessor is so vehicles queue up behind each other instead of stacking
// on the stop line like a clown car.
// -----------------------------------------------------------------------------

function computeVehicleAheadPositions(vehicles: Vehicle[]): Map<Vehicle, number | null> {
    const byDir = new Map<Direction, Vehicle[]>();
    for (const v of vehicles) {
        let arr = byDir.get(v.direction);
        if (!arr) {
            arr = [];
            byDir.set(v.direction, arr);
        }
        arr.push(v);
    }

    const result = new Map<Vehicle, number | null>();

    for (const [dir, group] of byDir) {
        const moveDir = MOVE_DIR[dir];
        const stopPos = STOP_POS[dir];

        // Sort by distance to stop line ascending — closest to stop line first.
        group.sort((a, b) => {
            const distA = (stopPos - a.pos) * moveDir;
            const distB = (stopPos - b.pos) * moveDir;
            return distA - distB;
        });

        for (let i = 0; i < group.length; i++) {
            if (i === 0) {
                result.set(group[i], null); // lead vehicle — nobody ahead
            } else {
                result.set(group[i], group[i - 1].pos);
            }
        }
    }

    return result;
}

// -----------------------------------------------------------------------------
// Compute the effective stop position for a vehicle, accounting for the queue.
//
// Lead vehicle stops at the stop line. Following vehicles stop one car-length
// + gap behind whoever's in front. If the vehicle ahead is already past the
// stop line (committed through), fall back to the stop line itself.
// -----------------------------------------------------------------------------

function effectiveStopPos(v: Vehicle, aheadPos: number | null): number {
    const moveDir = MOVE_DIR[v.direction];
    const stopPos = STOP_POS[v.direction];

    if (aheadPos === null) {
        return stopPos;
    }

    // Is the vehicle ahead past the stop line? If so, we're effectively the lead.
    const aheadDistToStop = (stopPos - aheadPos) * moveDir;
    if (aheadDistToStop < 0) {
        return stopPos;
    }

    // Queue behind the vehicle ahead: one car-length + follow gap
    const queuePos = aheadPos - moveDir * (VEHICLE_HEIGHT + VEHICLE_FOLLOW_GAP);

    // Clamp: don't queue past the stop line (toward the intersection)
    const queueDistToStop = (stopPos - queuePos) * moveDir;
    if (queueDistToStop < 0) {
        return stopPos;
    }

    return queuePos;
}

function updateVehicle(v: Vehicle, signal: VehicleSignalState, aheadPos: number | null): void {
    const moveDir = MOVE_DIR[v.direction];
    const stopPos = STOP_POS[v.direction];
    const exitPos = EXIT_POS[v.direction];
    const entryPos = ENTRY_POS[v.direction];

    const distToStop = (stopPos - v.pos) * moveDir;
    const effStop = effectiveStopPos(v, aheadPos);
    const distToEffective = (effStop - v.pos) * moveDir;

    if (distToStop < 0) {
        // Already past the stop line — committed. Clear the intersection.
        v.speed = Math.min(v.maxSpeed, v.speed + VEHICLE_ACCEL * v.accelJitter);
    } else if (signal === "green") {
        // Green means go. All vehicles accelerate freely — queue awareness is
        // only for red/yellow. Minor overlap during simultaneous acceleration
        // from a queue is imperceptible at these speeds.
        v.speed = Math.min(v.maxSpeed, v.speed + VEHICLE_ACCEL * v.accelJitter);
    } else if (signal === "yellow") {
        // Close to the stop line and moving? Commit through.
        if (distToStop < VEHICLE_HEIGHT * 2 && v.speed > 0) {
            v.speed = Math.min(v.maxSpeed * 0.5, v.speed + VEHICLE_ACCEL * 0.5);
        } else {
            // Treat like red — approach the queue and stop
            applyApproachAndStop(v, distToEffective);
        }
    } else {
        // Red — approach the effective stop position, decelerate smoothly into queue
        applyApproachAndStop(v, distToEffective);
    }

    // Universal following-distance constraint: never close the gap to the
    // vehicle ahead below one car-length + follow gap. Applies regardless of
    // signal state — prevents overlap during green acceleration from a queue.
    if (aheadPos !== null) {
        const distToAhead = (aheadPos - v.pos) * moveDir;
        if (distToAhead > 0) {
            const minGap = VEHICLE_HEIGHT + VEHICLE_FOLLOW_GAP;
            const maxMove = distToAhead - minGap;
            if (maxMove <= 0) {
                v.speed = 0;
            } else if (v.speed > maxMove) {
                v.speed = maxMove;
            }
        }
    }

    v.pos += moveDir * v.speed;

    // Wrap vehicles that exit the canvas
    const wrapped = moveDir > 0 ? v.pos > exitPos : v.pos < exitPos;
    if (wrapped) {
        v.pos = entryPos + (Math.random() - 0.5) * 30;
        v.speed = 0;
    }
}

// Shared red/yellow approach logic: drive toward the effective stop position,
// then decelerate smoothly to a halt. No more freezing 100px away from the
// intersection like you just saw a ghost.
function applyApproachAndStop(v: Vehicle, distToEffective: number): void {
    if (distToEffective <= 1) {
        // Arrived at queue position
        v.speed = 0;
    } else {
        // Braking distance at current speed: v²/(2*decel)
        const brakingDist = (v.speed * v.speed) / (2 * VEHICLE_DECEL);
        // Start braking when within 1.5× braking distance (smooth margin)
        const brakingZone = brakingDist * 1.5 + VEHICLE_HEIGHT;

        if (distToEffective <= brakingZone) {
            // Within braking zone — decelerate proportionally
            v.speed = Math.max(0, v.speed - VEHICLE_DECEL * v.accelJitter);
        } else {
            // Far away — continue approaching at a relaxed cruise speed
            // (70% max — nobody floors it toward a red light)
            const cruiseSpeed = v.maxSpeed * 0.7;
            if (v.speed < cruiseSpeed) {
                v.speed = Math.min(cruiseSpeed, v.speed + VEHICLE_ACCEL * v.accelJitter);
            }
        }
    }
}

function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle): void {
    const lateral = LANE_CENTER[v.direction];
    const vertical = IS_VERTICAL[v.direction];

    const x = vertical ? lateral : v.pos;
    const y = vertical ? v.pos : lateral;
    const w = vertical ? VEHICLE_WIDTH : VEHICLE_HEIGHT;
    const h = vertical ? VEHICLE_HEIGHT : VEHICLE_WIDTH;

    ctx.save();

    // Car body
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
    ctx.fill();

    // Windshield — small dark rectangle at the "front"
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    const wsW = w * 0.7;
    const wsH = h * 0.3;
    let wsX = x - wsW / 2;
    let wsY: number;
    if (vertical) {
        // North-facing (moving down): front is bottom; South (moving up): front is top
        wsY = MOVE_DIR[v.direction] > 0 ? y + h / 2 - wsH - 1 : y - h / 2 + 1;
    } else {
        wsY = y - wsH / 2;
        wsX = MOVE_DIR[v.direction] > 0 ? x + w / 2 - wsW - 1 : x - w / 2 + 1;
    }
    ctx.fillRect(wsX, wsY, wsW, wsH);

    ctx.restore();
}

// -----------------------------------------------------------------------------
// Pedestrian type and spawn configuration
// -----------------------------------------------------------------------------

interface Pedestrian {
    // Which crosswalk: "ns-top", "ns-bottom", "ew-left", "ew-right"
    crosswalk: "ns-top" | "ns-bottom" | "ew-left" | "ew-right";
    // Position along the crosswalk (0 = start side, 1 = end side)
    t: number;
    speed: number;
    maxSpeed: number;
    // Which side they start on this loop
    startSide: 0 | 1;
    color: string;
}

const PED_COLORS = ["#ffd700", "#ff8c69", "#87ceeb", "#98fb98", "#dda0dd"];

/**
 * Spawns 3 pedestrians per crosswalk, alternating start sides so they
 * immediately look like a natural two-way flow rather than a one-directional parade.
 */
function spawnPedestrians(): Pedestrian[] {
    const peds: Pedestrian[] = [];
    const crosswalks: Pedestrian["crosswalk"][] = ["ns-top", "ns-bottom", "ew-left", "ew-right"];

    for (const cw of crosswalks) {
        // 3 pedestrians per crosswalk, staggered
        for (let i = 0; i < 3; i++) {
            const colorIdx = Math.floor(Math.random() * PED_COLORS.length);
            const side = (i % 2) as 0 | 1;
            peds.push({
                crosswalk: cw,
                t: side, // start on the sidewalk, not mid-road
                speed: 0,
                maxSpeed: PED_MAX_SPEED * (0.7 + Math.random() * 0.6),
                startSide: side,
                color: PED_COLORS[colorIdx],
            });
        }
    }
    return peds;
}

/**
 * Resolves which pedestrian signal applies to a given crosswalk.
 *
 * The mapping is counter-intuitive at first glance: N/S crosswalks (which span
 * the N/S road) are safe when E/W vehicles are stopped, so they follow the E/W
 * pedestrian signal. E/W crosswalks follow the N/S pedestrian signal for the
 * same reason — they're safe during the opposite phase.
 */
function pedSignalForCrosswalk(cw: Pedestrian["crosswalk"], signals: SignalStates): PedSignalState {
    if (cw === "ns-top" || cw === "ns-bottom") {
        // ns crosswalks span the N/S road — pedestrians walk E/W across them.
        // Safe when N/S vehicles are stopped (E/W phase active), so use ewPed.
        return signals.ewPed;
    }
    // ew crosswalks span the E/W road — pedestrians walk N/S across them.
    // Safe when E/W vehicles are stopped (N/S phase active), so use nsPed.
    return signals.nsPed;
}

/**
 * Returns the canvas (x, y) for a pedestrian at parametric position `t` along their crosswalk.
 * `t=0` is one side of the road, `t=1` is the other. The mapping from t to pixels
 * is linear across the full road width.
 */
function pedPosition(ped: Pedestrian, t: number): { x: number; y: number } {
    const half = ROAD_HALF;

    switch (ped.crosswalk) {
        case "ns-top": {
            // Crosswalk at top of intersection, crossing the N/S road horizontally
            const y = CW_NEAR - PED_RADIUS * 2;
            const x = CANVAS_CENTER - half + t * ROAD_WIDTH;
            return { x, y };
        }
        case "ns-bottom": {
            const y = CANVAS_SIZE - CW_NEAR + PED_RADIUS * 2;
            const x = CANVAS_CENTER - half + t * ROAD_WIDTH;
            return { x, y };
        }
        case "ew-left": {
            // Crosswalk at left of intersection, crossing the E/W road vertically
            const x = CW_NEAR - PED_RADIUS * 2;
            const y = CANVAS_CENTER - half + t * ROAD_WIDTH;
            return { x, y };
        }
        case "ew-right": {
            const x = CANVAS_SIZE - CW_NEAR + PED_RADIUS * 2;
            const y = CANVAS_CENTER - half + t * ROAD_WIDTH;
            return { x, y };
        }
    }
}

function updatePedestrian(ped: Pedestrian, signal: PedSignalState): void {
    const direction = ped.startSide === 0 ? 1 : -1;

    if (signal === "walk") {
        ped.speed = Math.min(ped.maxSpeed, ped.speed + PED_ACCEL);
    } else if (ped.t > 0 && ped.t < 1) {
        // Mid-crossing peds coast through at current speed — "don't walk" means
        // "don't START crossing", not "freeze in the middle of the road".
    } else {
        // dontWalk and at the sidewalk edge — don't start a new crossing
        ped.speed = Math.max(0, ped.speed - PED_ACCEL);
    }

    ped.t += direction * ped.speed * 0.005;

    // Clamp to the destination side and prepare for the return trip.
    // startSide tracks which end the ped is currently at — direction derives from it.
    if (ped.t > 1) {
        ped.t = 1;
        ped.startSide = 1;
        ped.speed = 0;
    } else if (ped.t < 0) {
        ped.t = 0;
        ped.startSide = 0;
        ped.speed = 0;
    }
}

function drawPedestrian(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
    const { x, y } = pedPosition(ped, ped.t);

    ctx.save();

    // Body circle
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(x, y, PED_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Head (smaller circle on top)
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(x, y - PED_RADIUS * 1.4, PED_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// -----------------------------------------------------------------------------
// Traffic signal housing drawing
//
// Two signals — one for N/S traffic, one for E/W — placed on diagonally
// opposite sidewalk corners outside the crosswalks. Each signal has a small
// label so the viewer can tell which road it controls at a glance.
// -----------------------------------------------------------------------------

interface SignalHousingConfig {
    // Center of the housing
    x: number;
    y: number;
    // Lens positions relative to housing center (top = red, mid = yellow, bot = green)
    vertical: boolean;
    // Short label drawn next to the housing
    label: string;
    // Offset from housing center to label center
    labelDx: number;
    labelDy: number;
}

// Two vehicle signals, one per phase, on diagonally opposite corners.
// Pushed further into the corners to leave room for flush ped signs.
const VEHICLE_SIGNAL_POSITIONS: Record<"ns" | "ew", SignalHousingConfig> = {
    ns: {
        x: CANVAS_CENTER + ROAD_HALF + 50,
        y: CW_NEAR - 50,
        vertical: true,
        label: "N/S",
        labelDx: 0,
        labelDy: -30,
    },
    ew: {
        x: CW_NEAR - 50,
        y: CANVAS_CENTER + ROAD_HALF + 50,
        vertical: false,
        label: "E/W",
        labelDx: 0,
        labelDy: -20,
    },
};

function drawVehicleSignal(
    ctx: CanvasRenderingContext2D,
    config: SignalHousingConfig,
    state: VehicleSignalState
): void {
    const { x, y, vertical } = config;
    const lensSpacing = SIGNAL_LENS_RADIUS * 2.5;
    const housingH = lensSpacing * 3 + SIGNAL_LENS_RADIUS * 2;

    ctx.save();

    // Housing body
    ctx.fillStyle = SIGNAL_COLORS.housingBg;
    ctx.strokeStyle = SIGNAL_COLORS.housingBorder;
    ctx.lineWidth = 1.5;
    if (vertical) {
        ctx.beginPath();
        ctx.roundRect(
            x - SIGNAL_HOUSING_HALF_W,
            y - housingH / 2,
            SIGNAL_HOUSING_HALF_W * 2,
            housingH,
            4
        );
    } else {
        ctx.beginPath();
        ctx.roundRect(
            x - housingH / 2,
            y - SIGNAL_HOUSING_HALF_W,
            housingH,
            SIGNAL_HOUSING_HALF_W * 2,
            4
        );
    }
    ctx.fill();
    ctx.stroke();

    // Three lenses: [0]=red, [1]=yellow, [2]=green
    const lensColors: Record<VehicleSignalState, [string, string, string]> = {
        red: [SIGNAL_COLORS.red, SIGNAL_COLORS.off, SIGNAL_COLORS.off],
        yellow: [SIGNAL_COLORS.off, SIGNAL_COLORS.yellow, SIGNAL_COLORS.off],
        green: [SIGNAL_COLORS.off, SIGNAL_COLORS.off, SIGNAL_COLORS.green],
        off: [SIGNAL_COLORS.off, SIGNAL_COLORS.off, SIGNAL_COLORS.off],
    };

    const colors = lensColors[state];

    for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * lensSpacing;
        const lx = vertical ? x : x + offset;
        const ly = vertical ? y + offset : y;

        // Unlit lens (dim base)
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(lx, ly, SIGNAL_LENS_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Lit lens (only if active)
        if (colors[i] !== SIGNAL_COLORS.off) {
            ctx.fillStyle = colors[i];
            ctx.shadowColor = colors[i];
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(lx, ly, SIGNAL_LENS_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // Label
    if (config.label) {
        ctx.fillStyle = "#aaa";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(config.label, x + config.labelDx, y + config.labelDy);
    }

    ctx.restore();
}

// Pedestrian signal signs — framed text readable at canvas scale.
// Flush against their crosswalk; E/W signs rotated 90° to match orientation.

interface PedSignalConfig {
    x: number;
    y: number;
    // Rotation in radians around (x, y). 0 = horizontal text.
    rotation: number;
}

// Flush against each crosswalk, just outside the road edge.
// N/S signs are horizontal (rotation 0), E/W signs rotated to align with vertical crosswalks.
const PED_SIGNAL_POSITIONS: Record<Pedestrian["crosswalk"], PedSignalConfig> = {
    "ns-top": {
        x: CANVAS_CENTER + ROAD_HALF + 12,
        y: CW_NEAR + CROSSWALK_WIDTH / 2,
        rotation: Math.PI / 2,
    },
    "ns-bottom": {
        x: CANVAS_CENTER - ROAD_HALF - 12,
        y: CANVAS_SIZE - CW_NEAR - CROSSWALK_WIDTH / 2,
        rotation: -Math.PI / 2,
    },
    "ew-left": { x: CW_NEAR + CROSSWALK_WIDTH / 2, y: CANVAS_CENTER - ROAD_HALF - 12, rotation: 0 },
    "ew-right": {
        x: CANVAS_SIZE - CW_NEAR - CROSSWALK_WIDTH / 2,
        y: CANVAS_CENTER + ROAD_HALF + 12,
        rotation: 0,
    },
};

function drawPedSignal(
    ctx: CanvasRenderingContext2D,
    config: PedSignalConfig,
    state: PedSignalState,
    frameCount: number
): void {
    const { x, y, rotation } = config;

    // During flashingDontWalk, blink the entire sign
    const flashingOff = state === "flashingDontWalk" && Math.floor(frameCount / 30) % 2 === 1;

    const text = state === "walk" ? "WALK" : "WAIT";
    const color = state === "walk" ? SIGNAL_COLORS.walk : SIGNAL_COLORS.dontWalk;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.font = "bold 10px monospace";
    const measured = ctx.measureText(text);
    const padX = 5;
    const padY = 4;
    const w = measured.width + padX * 2;
    const h = 12 + padY * 2;

    // Sign background
    ctx.fillStyle = SIGNAL_COLORS.housingBg;
    ctx.strokeStyle = SIGNAL_COLORS.housingBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 3);
    ctx.fill();
    ctx.stroke();

    // Text (hidden during flash-off phase)
    if (!flashingOff) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 0, 0);
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}

// -----------------------------------------------------------------------------
// Static intersection geometry
// -----------------------------------------------------------------------------

function drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawRoads(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = ROAD_COLOR;
    // N/S road (vertical strip)
    ctx.fillRect(CANVAS_CENTER - ROAD_HALF, 0, ROAD_WIDTH, CANVAS_SIZE);
    // E/W road (horizontal strip)
    ctx.fillRect(0, CANVAS_CENTER - ROAD_HALF, CANVAS_SIZE, ROAD_WIDTH);
}

function drawLaneMarkings(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = LANE_STRIPE_COLOR;
    ctx.setLineDash([20, 15]);
    ctx.lineWidth = 2;

    // Center dashed stripe for N/S road
    ctx.beginPath();
    ctx.moveTo(CANVAS_CENTER, 0);
    ctx.lineTo(CANVAS_CENTER, CANVAS_CENTER - ROAD_HALF);
    ctx.moveTo(CANVAS_CENTER, CANVAS_CENTER + ROAD_HALF);
    ctx.lineTo(CANVAS_CENTER, CANVAS_SIZE);
    ctx.stroke();

    // Center dashed stripe for E/W road
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_CENTER);
    ctx.lineTo(CANVAS_CENTER - ROAD_HALF, CANVAS_CENTER);
    ctx.moveTo(CANVAS_CENTER + ROAD_HALF, CANVAS_CENTER);
    ctx.lineTo(CANVAS_SIZE, CANVAS_CENTER);
    ctx.stroke();

    ctx.setLineDash([]);
}

function drawCrosswalks(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = CROSSWALK_STRIPE_COLOR;
    const stripeW = 10;
    const stripeGap = 7;

    // Helper: draw zebra stripes in a rect
    function zebraH(x: number, y: number, width: number, height: number): void {
        let px = x;
        while (px < x + width) {
            ctx.fillRect(px, y, Math.min(stripeW, x + width - px), height);
            px += stripeW + stripeGap;
        }
    }
    function zebraV(x: number, y: number, width: number, height: number): void {
        let py = y;
        while (py < y + height) {
            ctx.fillRect(x, py, width, Math.min(stripeW, y + height - py));
            py += stripeW + stripeGap;
        }
    }

    // Top crosswalk (crossing N/S road, for pedestrians going E/W on N side)
    zebraH(CANVAS_CENTER - ROAD_HALF, CW_NEAR, ROAD_WIDTH, CROSSWALK_WIDTH);
    // Bottom crosswalk
    zebraH(CANVAS_CENTER - ROAD_HALF, CANVAS_SIZE - CW_FAR, ROAD_WIDTH, CROSSWALK_WIDTH);
    // Left crosswalk (crossing E/W road)
    zebraV(CW_NEAR, CANVAS_CENTER - ROAD_HALF, CROSSWALK_WIDTH, ROAD_WIDTH);
    // Right crosswalk
    zebraV(CANVAS_SIZE - CW_FAR, CANVAS_CENTER - ROAD_HALF, CROSSWALK_WIDTH, ROAD_WIDTH);
}

function drawStopLines(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = STOP_LINE_COLOR;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);

    // North arm stop line (at the crosswalk edge facing approaching traffic)
    ctx.beginPath();
    ctx.moveTo(CANVAS_CENTER - ROAD_HALF, CW_NEAR);
    ctx.lineTo(CANVAS_CENTER, CW_NEAR);
    ctx.stroke();

    // South arm stop line
    ctx.beginPath();
    ctx.moveTo(CANVAS_CENTER, CANVAS_SIZE - CW_NEAR);
    ctx.lineTo(CANVAS_CENTER + ROAD_HALF, CANVAS_SIZE - CW_NEAR);
    ctx.stroke();

    // East arm stop line
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE - CW_NEAR, CANVAS_CENTER - ROAD_HALF);
    ctx.lineTo(CANVAS_SIZE - CW_NEAR, CANVAS_CENTER);
    ctx.stroke();

    // West arm stop line
    ctx.beginPath();
    ctx.moveTo(CW_NEAR, CANVAS_CENTER);
    ctx.lineTo(CW_NEAR, CANVAS_CENTER + ROAD_HALF);
    ctx.stroke();
}

// -----------------------------------------------------------------------------
// Public renderer API
// -----------------------------------------------------------------------------

/**
 * Handle returned by createRenderer. Owns the requestAnimationFrame loop.
 * `start` is idempotent — calling it while already running is a no-op.
 */
export interface Renderer {
    /** Begins the animation loop, polling compositeState each frame. */
    start(getCompositeState: () => string): void;
    /** Cancels the animation loop. Safe to call when already stopped. */
    stop(): void;
}

/**
 * Creates a renderer bound to the given canvas element.
 *
 * Spawns the initial vehicle and pedestrian populations immediately. The animation
 * loop doesn't start until `start()` is called — this lets the page finish wiring
 * FSM subscriptions before the first frame fires.
 *
 * @param canvas - The canvas element to draw into. Must support 2D context.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) {
        throw new Error("[traffic-intersection] Failed to get 2D canvas context");
    }
    const ctx: CanvasRenderingContext2D = maybeCtx;
    let rafId = 0;
    let frameCount = 0;
    const vehicles = spawnVehicles();
    const pedestrians = spawnPedestrians();

    function frame(getCompositeState: () => string): void {
        frameCount++;
        const composite = getCompositeState();
        const signals = getSignalStates(composite);

        // --- Update ---
        const aheadMap = computeVehicleAheadPositions(vehicles);
        for (const v of vehicles) {
            const vSig = vehicleSignalForDirection(v.direction, signals);
            updateVehicle(v, vSig, aheadMap.get(v) ?? null);
        }
        for (const ped of pedestrians) {
            const pSig = pedSignalForCrosswalk(ped.crosswalk, signals);
            updatePedestrian(ped, pSig);
        }

        // --- Draw ---
        drawGround(ctx);
        drawRoads(ctx);
        drawLaneMarkings(ctx);
        drawCrosswalks(ctx);
        drawStopLines(ctx);

        for (const v of vehicles) {
            drawVehicle(ctx, v);
        }
        for (const ped of pedestrians) {
            drawPedestrian(ctx, ped);
        }

        // Vehicle signals — one per phase, on opposite corners
        drawVehicleSignal(ctx, VEHICLE_SIGNAL_POSITIONS.ns, signals.nsVehicle);
        drawVehicleSignal(ctx, VEHICLE_SIGNAL_POSITIONS.ew, signals.ewVehicle);

        // Pedestrian signals — ns crosswalks use ewPed, ew crosswalks use nsPed
        // (ns crosswalks cross the N/S road, safe when E/W phase is active)
        drawPedSignal(ctx, PED_SIGNAL_POSITIONS["ns-top"], signals.ewPed, frameCount);
        drawPedSignal(ctx, PED_SIGNAL_POSITIONS["ns-bottom"], signals.ewPed, frameCount);
        drawPedSignal(ctx, PED_SIGNAL_POSITIONS["ew-left"], signals.nsPed, frameCount);
        drawPedSignal(ctx, PED_SIGNAL_POSITIONS["ew-right"], signals.nsPed, frameCount);

        rafId = requestAnimationFrame(() => frame(getCompositeState));
    }

    return {
        start(getCompositeState: () => string): void {
            if (rafId !== 0) {
                return;
            }
            rafId = requestAnimationFrame(() => frame(getCompositeState));
        },

        stop(): void {
            if (rafId !== 0) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }
        },
    };
}
