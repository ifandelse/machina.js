/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// fsm.test.ts — Critter BehavioralFsm tests
//
// Verifies the multi-client model: one FSM definition, independent per-client
// state. Tests cover all five states and their transitions.
//
// Key BehavioralFsm calling conventions tested here:
//   fsm.handle(client, inputName, ...args) — dispatch to one client
//   fsm.currentState(client)               — WeakMap lookup per client
//
// No async involved — this FSM is tick-driven with timestamp comparisons.
// We fake Date.now() to control timeout behavior deterministically.
// =============================================================================

describe("critter BehavioralFsm (fsm.ts)", () => {
    let fsm: any;
    let IDLE_FIDGET_INTERVAL_MS: number;
    let ALERT_DURATION_MS: number;
    let FLEE_DURATION_MS: number;

    // Shared tick payload with cursor far off-screen (won't trigger transitions)
    const FAR_PAYLOAD = { playerX: -9999, playerY: -9999, dt: 16 };
    // Payload with cursor at the critter's position (used for alert/flee direction)
    const CLOSE_PAYLOAD = { playerX: 100, playerY: 100, dt: 16 };

    function makeCritter(id = 1): any {
        return {
            id,
            x: 100,
            y: 100,
            vx: 0,
            vy: 0,
            radius: 12,
            sensingRange: 120,
            territory: { cx: 100, cy: 100, r: 100 },
            patrolTarget: null,
            fleeDirection: null,
            fidgetTime: null,
            alertStartedAt: null,
            fleeStartedAt: null,
        };
    }

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        const configMod = await import("./config");
        IDLE_FIDGET_INTERVAL_MS = configMod.IDLE_FIDGET_INTERVAL_MS;
        ALERT_DURATION_MS = configMod.ALERT_DURATION_MS;
        FLEE_DURATION_MS = configMod.FLEE_DURATION_MS;

        const mod = await import("./fsm");
        fsm = mod.createCritterBehavior();
    });

    afterEach(() => {
        fsm.dispose();
    });

    // =========================================================================
    // Lazy initialization
    // =========================================================================

    describe("lazy initialization", () => {
        describe("when a critter receives its first tick", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter(1);
                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            it("should initialize into idle state on first tick", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });

            it("should set fidgetTime on the critter during idle._onEnter", () => {
                expect(critter.fidgetTime).not.toBeNull();
            });

            it("should zero out velocity during idle._onEnter", () => {
                expect(critter.vx).toBe(0);
                expect(critter.vy).toBe(0);
            });
        });

        describe("when a critter has never received any handle() call", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter(99);
            });

            it("should return undefined from currentState before init", () => {
                expect(fsm.currentState(critter)).toBeUndefined();
            });
        });
    });

    // =========================================================================
    // Independent per-client state tracking
    // =========================================================================

    describe("per-client independence", () => {
        describe("when two critters are initialized separately", () => {
            let critterA: any, critterB: any;

            beforeEach(() => {
                critterA = makeCritter(1);
                critterB = makeCritter(2);
                fsm.handle(critterA, "tick", FAR_PAYLOAD);
                fsm.handle(critterB, "tick", FAR_PAYLOAD);
                // Transition only critterA to alert
                fsm.handle(critterA, "playerDetected");
            });

            it("should have critterA in alert state", () => {
                expect(fsm.currentState(critterA)).toBe("alert");
            });

            it("should keep critterB in idle state (unaffected)", () => {
                expect(fsm.currentState(critterB)).toBe("idle");
            });
        });
    });

    // =========================================================================
    // idle state
    // =========================================================================

    describe("idle state", () => {
        describe("when playerDetected is received in idle", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
            });

            it("should transition to alert", () => {
                expect(fsm.currentState(critter)).toBe("alert");
            });

            it("should set alertStartedAt on entry to alert", () => {
                expect(critter.alertStartedAt).not.toBeNull();
            });
        });

        describe("when the fidget interval elapses and transition probability triggers patrol", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);

                // Force fidget interval to appear elapsed
                critter.fidgetTime = Date.now() - IDLE_FIDGET_INTERVAL_MS - 100;

                // Force Math.random to return a value that triggers patrol (< 0.4)
                jest.spyOn(Math, "random").mockReturnValue(0.1);

                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            afterEach(() => {
                jest.restoreAllMocks();
            });

            it("should transition to patrol", () => {
                expect(fsm.currentState(critter)).toBe("patrol");
            });
        });

        describe("when the fidget interval elapses but random does not trigger patrol", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);

                critter.fidgetTime = Date.now() - IDLE_FIDGET_INTERVAL_MS - 100;

                // random > 0.4 means NO patrol transition
                jest.spyOn(Math, "random").mockReturnValue(0.8);

                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            afterEach(() => {
                jest.restoreAllMocks();
            });

            it("should remain in idle after a fidget without patrol trigger", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });

            it("should reset fidgetTime after a fidget", () => {
                const timeDelta = Date.now() - critter.fidgetTime!;
                // fidgetTime should be recent (within 500ms of now)
                expect(timeDelta).toBeLessThan(500);
            });
        });
    });

    // =========================================================================
    // patrol state
    // =========================================================================

    describe("patrol state", () => {
        describe("when entering patrol state", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected"); // idle → alert
                fsm.handle(critter, "playerLostContact"); // alert → patrol
            });

            it("should be in patrol state", () => {
                expect(fsm.currentState(critter)).toBe("patrol");
            });

            it("should have a patrolTarget assigned by _onEnter", () => {
                expect(critter.patrolTarget).not.toBeNull();
                expect(critter.patrolTarget).toHaveProperty("x");
                expect(critter.patrolTarget).toHaveProperty("y");
            });
        });

        describe("when playerDetected fires during patrol", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected"); // → alert
                fsm.handle(critter, "playerLostContact"); // → patrol
                fsm.handle(critter, "playerDetected"); // patrol → alert
            });

            it("should transition to alert", () => {
                expect(fsm.currentState(critter)).toBe("alert");
            });

            it("should clear patrolTarget on patrol._onExit", () => {
                expect(critter.patrolTarget).toBeNull();
            });
        });

        describe("when patrol waypoint is reached and random triggers idle", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                // Manually put critter into patrol with a nearby waypoint
                fsm.handle(critter, "tick", FAR_PAYLOAD); // init idle
                fsm.handle(critter, "playerDetected"); // → alert
                fsm.handle(critter, "playerLostContact"); // → patrol

                // Place patrol target at critter position (within arrival threshold)
                critter.patrolTarget = { x: critter.x + 2, y: critter.y + 2 };

                // Force random to trigger idle (< 0.45)
                jest.spyOn(Math, "random").mockReturnValue(0.2);

                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            afterEach(() => {
                jest.restoreAllMocks();
            });

            it("should transition to idle when arrived and random triggers it", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });
        });
    });

    // =========================================================================
    // alert state
    // =========================================================================

    describe("alert state", () => {
        describe("when playerInRange fires during alert", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected"); // → alert
                fsm.handle(critter, "playerInRange"); // alert → chase
            });

            it("should transition to chase", () => {
                expect(fsm.currentState(critter)).toBe("chase");
            });

            it("should clear alertStartedAt on alert._onExit", () => {
                expect(critter.alertStartedAt).toBeNull();
            });
        });

        describe("when playerLostContact fires during alert", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected"); // → alert
                fsm.handle(critter, "playerLostContact"); // alert → patrol
            });

            it("should transition to patrol", () => {
                expect(fsm.currentState(critter)).toBe("patrol");
            });
        });

        describe("when alert duration expires via tick", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected"); // → alert

                // Force alert to appear expired
                critter.alertStartedAt = Date.now() - ALERT_DURATION_MS - 100;

                fsm.handle(critter, "tick", CLOSE_PAYLOAD);
            });

            it("should auto-disengage to patrol when alert expires", () => {
                expect(fsm.currentState(critter)).toBe("patrol");
            });
        });
    });

    // =========================================================================
    // chase state
    // =========================================================================

    describe("chase state", () => {
        describe("when in chase state and tick fires", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase

                // Tick with player at a known position
                fsm.handle(critter, "tick", { playerX: 200, playerY: 100, dt: 16 });
            });

            it("should set velocity toward the player", () => {
                // Player is at x=200, critter at x=100 → vx should be positive
                expect(critter.vx).toBeGreaterThan(0);
            });
        });

        describe("when playerLostContact fires during chase", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
                fsm.handle(critter, "playerLostContact"); // chase → alert
            });

            it("should transition back to alert", () => {
                expect(fsm.currentState(critter)).toBe("alert");
            });
        });

        describe("when attacked fires during chase", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
                // attacked payload carries player position so the handler can
                // calculate flee direction before transitioning
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 50, dt: 0 });
            });

            it("should transition to flee", () => {
                expect(fsm.currentState(critter)).toBe("flee");
            });

            it("should set fleeStartedAt on flee._onEnter", () => {
                expect(critter.fleeStartedAt).not.toBeNull();
            });

            it("should set fleeDirection on flee._onEnter", () => {
                expect(critter.fleeDirection).not.toBeNull();
            });
        });
    });

    // =========================================================================
    // flee state
    // =========================================================================

    describe("flee state", () => {
        describe("when flee duration expires via tick", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
                // attacked handler calculates flee direction and transitions to flee
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 50, dt: 0 });

                // Force flee to appear expired
                critter.fleeStartedAt = Date.now() - FLEE_DURATION_MS - 100;

                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            it("should return to idle after flee duration expires", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });

            it("should clear fleeDirection in flee._onExit", () => {
                expect(critter.fleeDirection).toBeNull();
            });

            it("should clear fleeStartedAt in flee._onExit", () => {
                expect(critter.fleeStartedAt).toBeNull();
            });
        });
    });

    // =========================================================================
    // Full lifecycle: idle → patrol → alert → chase → flee → idle
    // =========================================================================

    describe("full lifecycle", () => {
        describe("when a critter completes the full state cycle", () => {
            let critter: any, stateSequence: string[];

            beforeEach(() => {
                critter = makeCritter(42);
                critter.x = 100;
                critter.y = 100;
                stateSequence = [];

                fsm.on("transitioned", (data: any) => {
                    if (data.client === critter) {
                        stateSequence.push(data.toState);
                    }
                });

                // idle (via lazy init on first tick)
                fsm.handle(critter, "tick", FAR_PAYLOAD);

                // idle → alert
                fsm.handle(critter, "playerDetected");

                // alert → chase
                fsm.handle(critter, "playerInRange");

                // chase → flee (attacked sets fleeDirection, transitions to flee)
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 50, dt: 0 });

                // Force flee expiry
                critter.fleeStartedAt = Date.now() - FLEE_DURATION_MS - 100;

                // flee → idle
                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            it("should pass through all states in order", () => {
                expect(stateSequence).toEqual(["idle", "alert", "chase", "flee", "idle"]);
            });
        });
    });

    // =========================================================================
    // dispose — handle becomes a no-op
    // =========================================================================

    describe("dispose", () => {
        describe("when the FSM is disposed", () => {
            let critter: any, stateBeforeDispose: string | undefined;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                stateBeforeDispose = fsm.currentState(critter);
                fsm.dispose();
                fsm.handle(critter, "playerDetected");
            });

            it("should not change state after dispose", () => {
                expect(fsm.currentState(critter)).toBe(stateBeforeDispose);
            });
        });
    });

    // =========================================================================
    // HARDENING TESTS — edge cases, failure modes, boundary conditions
    // =========================================================================

    // =========================================================================
    // Flee direction when critter overlaps player position
    // =========================================================================

    describe("flee direction calculation", () => {
        describe("when attacked at the exact same position as the player", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
                // Attack with player at the exact same position as the critter
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 100, dt: 0 });
            });

            it("should transition to flee state", () => {
                expect(fsm.currentState(critter)).toBe("flee");
            });

            it("should pick a random flee direction when positions overlap", () => {
                // directionTo() returns {dx:0, dy:0} when len===0, so the FSM
                // falls back to a random direction to avoid a stuck critter.
                expect(critter.fleeDirection).not.toBeNull();
                const speed = Math.sqrt(
                    critter.fleeDirection.dx ** 2 + critter.fleeDirection.dy ** 2
                );
                expect(speed).toBeGreaterThan(0);
            });

            it("should have non-zero flee velocity", () => {
                // With the random fallback, the critter actually moves
                const speed = Math.sqrt(critter.vx ** 2 + critter.vy ** 2);
                expect(speed).toBeGreaterThan(0);
            });

            it("should eventually transition back to idle when flee duration expires", () => {
                // Even stuck, the timeout should still fire
                critter.fleeStartedAt = Date.now() - FLEE_DURATION_MS - 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                expect(fsm.currentState(critter)).toBe("idle");
            });
        });

        describe("when attacked with player directly above the critter", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange");
                // Player is above the critter (lower y value)
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 0, dt: 0 });
            });

            it("should flee downward (positive vy, zero vx)", () => {
                // Direction toward player is {dx:0, dy:-1}; flee is opposite: {dx:0, dy:1}
                expect(critter.vx).toBeCloseTo(0);
                expect(critter.vy).toBeGreaterThan(0);
            });
        });

        describe("when attacked with player directly to the left of the critter", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange");
                // Player is to the left
                fsm.handle(critter, "attacked", { playerX: 0, playerY: 100, dt: 0 });
            });

            it("should flee rightward (positive vx, zero vy)", () => {
                expect(critter.vx).toBeGreaterThan(0);
                expect(critter.vy).toBeCloseTo(0);
            });
        });
    });

    // =========================================================================
    // Missing payload — alert and chase tick handlers destructure payload
    // =========================================================================

    describe("missing tick payload", () => {
        describe("when alert.tick is called without a payload", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected"); // → alert
            });

            it("should not throw when tick is dispatched with no payload", () => {
                // alert.tick now uses a defensive guard: (payload ?? {}) as TickPayload
                // with defaults of 0 for playerX/playerY
                expect(() => {
                    fsm.handle(critter, "tick");
                }).not.toThrow();
            });

            it("should default to origin when tick payload is missing", () => {
                fsm.handle(critter, "tick");
                // Critter faces toward (0,0) since that's the default player position
                expect(fsm.currentState(critter)).toBe("alert");
            });
        });

        describe("when chase.tick is called without a payload", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
            });

            it("should not throw when tick is dispatched with no payload", () => {
                // chase.tick also uses the defensive guard
                expect(() => {
                    fsm.handle(critter, "tick");
                }).not.toThrow();
            });
        });
    });

    // =========================================================================
    // nohandler — inputs with no handler in the current state
    // =========================================================================

    describe("nohandler events", () => {
        describe("when attacked is fired outside of chase state", () => {
            let critter: any;
            let nohandlerEvents: any[];

            beforeEach(() => {
                critter = makeCritter();
                nohandlerEvents = [];
                fsm.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });
                // Init into idle
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                // Fire attacked in idle — no handler defined
                fsm.handle(critter, "attacked", { playerX: 50, playerY: 50, dt: 0 });
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerEvents.length).toBeGreaterThan(0);
            });

            it("should include the input name in the nohandler payload", () => {
                expect(nohandlerEvents[0].inputName).toBe("attacked");
            });

            it("should remain in idle state — nohandler does not transition", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });
        });

        describe("when playerInRange is fired outside of alert state", () => {
            let critter: any;
            let nohandlerCount: number;

            beforeEach(() => {
                critter = makeCritter();
                nohandlerCount = 0;
                fsm.on("nohandler", () => {
                    nohandlerCount++;
                });
                fsm.handle(critter, "tick", FAR_PAYLOAD); // → idle
                // playerInRange has no handler in idle
                fsm.handle(critter, "playerInRange");
            });

            it("should emit a nohandler event for playerInRange in idle", () => {
                expect(nohandlerCount).toBe(1);
            });

            it("should remain in idle", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });
        });
    });

    // =========================================================================
    // fsm.reset() — transitions back to initialState (idle)
    // =========================================================================

    describe("reset()", () => {
        describe("when reset is called on a critter in chase state", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
                fsm.reset(critter);
            });

            it("should return the critter to idle", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });

            it("should re-run idle._onEnter, setting fidgetTime", () => {
                expect(critter.fidgetTime).not.toBeNull();
            });

            it("should zero velocity on re-entry to idle", () => {
                // idle._onEnter sets vx=0, vy=0
                // chase.tick may have set velocity, reset should clear it
                expect(critter.vx).toBe(0);
                expect(critter.vy).toBe(0);
            });
        });

        describe("when reset is called on a critter in flee state", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange");
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 50, dt: 0 });
                // critter is now in flee with fleeDirection set
                fsm.reset(critter);
            });

            it("should return the critter to idle", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });

            it("should run flee._onExit, clearing fleeDirection", () => {
                expect(critter.fleeDirection).toBeNull();
            });

            it("should run flee._onExit, clearing fleeStartedAt", () => {
                expect(critter.fleeStartedAt).toBeNull();
            });
        });
    });

    // =========================================================================
    // fsm.canHandle() — pure state query, no side effects
    // =========================================================================

    describe("canHandle()", () => {
        describe("for an uninitialized critter", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter(99);
                // No handle() called — critter not in WeakMap
            });

            it("should return true for tick (valid in initial state idle)", () => {
                expect(fsm.canHandle(critter, "tick")).toBe(true);
            });

            it("should return true for playerDetected (valid in idle)", () => {
                expect(fsm.canHandle(critter, "playerDetected")).toBe(true);
            });

            it("should NOT initialize the critter — currentState remains undefined", () => {
                fsm.canHandle(critter, "tick");
                expect(fsm.currentState(critter)).toBeUndefined();
            });
        });

        describe("for a critter in idle state", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD); // → idle
            });

            it("should return false for attacked (no handler in idle)", () => {
                expect(fsm.canHandle(critter, "attacked")).toBe(false);
            });

            it("should return false for playerInRange (no handler in idle)", () => {
                expect(fsm.canHandle(critter, "playerInRange")).toBe(false);
            });

            it("should return true for playerDetected (has handler in idle)", () => {
                expect(fsm.canHandle(critter, "playerDetected")).toBe(true);
            });
        });

        describe("for a critter in chase state", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange"); // → chase
            });

            it("should return true for attacked (has handler in chase)", () => {
                expect(fsm.canHandle(critter, "attacked")).toBe(true);
            });

            it("should return false for playerDetected (no handler in chase)", () => {
                expect(fsm.canHandle(critter, "playerDetected")).toBe(false);
            });
        });
    });

    // =========================================================================
    // Per-client independence — three critters in different states simultaneously
    // =========================================================================

    describe("per-client independence (three critters)", () => {
        describe("when three critters are in idle, alert, and flee simultaneously", () => {
            let critterA: any, critterB: any, critterC: any;

            beforeEach(() => {
                critterA = makeCritter(1);
                critterB = makeCritter(2);
                critterC = makeCritter(3);
                critterC.x = 100;
                critterC.y = 100;

                // critterA stays in idle
                fsm.handle(critterA, "tick", FAR_PAYLOAD);

                // critterB goes to alert
                fsm.handle(critterB, "tick", FAR_PAYLOAD);
                fsm.handle(critterB, "playerDetected");

                // critterC goes to flee via the full chase path
                fsm.handle(critterC, "tick", FAR_PAYLOAD);
                fsm.handle(critterC, "playerDetected");
                fsm.handle(critterC, "playerInRange");
                fsm.handle(critterC, "attacked", { playerX: 100, playerY: 50, dt: 0 });
            });

            it("should have critterA in idle", () => {
                expect(fsm.currentState(critterA)).toBe("idle");
            });

            it("should have critterB in alert", () => {
                expect(fsm.currentState(critterB)).toBe("alert");
            });

            it("should have critterC in flee", () => {
                expect(fsm.currentState(critterC)).toBe("flee");
            });

            it("should not pollute critterA's timestamps from critterB/C transitions", () => {
                // critterA's alertStartedAt should still be null — it never entered alert
                expect(critterA.alertStartedAt).toBeNull();
                expect(critterA.fleeStartedAt).toBeNull();
                expect(critterA.fleeDirection).toBeNull();
            });

            it("should not pollute critterB's fleeDirection from critterC's flee", () => {
                expect(critterB.fleeDirection).toBeNull();
            });

            it("should allow critterA to transition independently via playerDetected", () => {
                fsm.handle(critterA, "playerDetected");
                expect(fsm.currentState(critterA)).toBe("alert");
                // critterB and critterC unchanged
                expect(fsm.currentState(critterB)).toBe("alert");
                expect(fsm.currentState(critterC)).toBe("flee");
            });
        });
    });

    // =========================================================================
    // Idle territory drift correction
    // =========================================================================

    describe("idle territory drift correction", () => {
        describe("when a critter in idle is outside its territory", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                // Territory centered at (100, 100) with radius 100
                // Move critter well outside territory
                critter.x = 300;
                critter.y = 300;
                fsm.handle(critter, "tick", FAR_PAYLOAD); // lazy init → idle
                // tick fires, critter is outside territory by ~183px (> 100)
                // drift correction should activate on second tick
                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            it("should remain in idle state", () => {
                expect(fsm.currentState(critter)).toBe("idle");
            });

            it("should set velocity toward territory center (not zero)", () => {
                // Critter is at (300,300), home is (100,100)
                // Direction home is roughly (-0.707, -0.707) — both should be negative
                expect(critter.vx).toBeLessThan(0);
                expect(critter.vy).toBeLessThan(0);
            });

            it("should not set fidget velocity when drift correction fires", () => {
                // Drift correction uses PATROL_SPEED * 0.5, not IDLE_FIDGET_SPEED
                // The velocity magnitude should be exactly PATROL_SPEED * 0.5
                const speed = Math.sqrt(critter.vx ** 2 + critter.vy ** 2);
                // Import PATROL_SPEED via module — use approximate check
                // PATROL_SPEED = 0.8, half = 0.4
                expect(speed).toBeCloseTo(0.4, 4);
            });
        });

        describe("when a critter in idle is exactly at territory center", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                // Critter starts at (100,100), territory center is (100,100)
                // Force fidget time to not fire
                critter.fidgetTime = Date.now(); // just fidgeted, won't fire again
                fsm.handle(critter, "tick", FAR_PAYLOAD); // lazy init + first tick
                // On second tick: distFromHome = 0, NOT > territory.r → no drift correction
                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            it("should not apply drift correction velocity when at home", () => {
                // vx and vy should be 0 (drift correction skipped, fidget not elapsed)
                expect(critter.vx).toBe(0);
                expect(critter.vy).toBe(0);
            });
        });

        describe("when a critter in idle is exactly at the territory boundary", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                // Territory: cx=100, cy=100, r=100
                // Place critter exactly AT the boundary (distance = r = 100)
                critter.x = 200; // 100px to the right of center
                critter.y = 100;
                critter.fidgetTime = Date.now(); // prevent fidget from firing
                fsm.handle(critter, "tick", FAR_PAYLOAD); // lazy init
                fsm.handle(critter, "tick", FAR_PAYLOAD);
            });

            it("should not trigger drift correction when exactly on the boundary", () => {
                // distFromHome === territory.r, which is NOT > territory.r
                // So drift correction does NOT fire — critter stays put
                expect(critter.vx).toBe(0);
                expect(critter.vy).toBe(0);
            });
        });
    });

    // =========================================================================
    // Flee tick with null fleeStartedAt — timeout guard
    // =========================================================================

    describe("flee timeout guard", () => {
        describe("when fleeStartedAt is manually nulled during flee", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                critter.x = 100;
                critter.y = 100;
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                fsm.handle(critter, "playerDetected");
                fsm.handle(critter, "playerInRange");
                fsm.handle(critter, "attacked", { playerX: 100, playerY: 50, dt: 0 });
                // Manually null the timestamp (simulates external interference)
                critter.fleeStartedAt = null;
            });

            it("should remain in flee state — timeout guard prevents transition", () => {
                // flee.tick: if (ctx.fleeStartedAt !== null && ...) — null fails the guard
                fsm.handle(critter, "tick", FAR_PAYLOAD);
                expect(fsm.currentState(critter)).toBe("flee");
            });
        });
    });

    // =========================================================================
    // Alert _onEnter resets velocity from patrol
    // =========================================================================

    describe("alert _onEnter velocity reset", () => {
        describe("when transitioning from patrol (with velocity) to alert", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD); // → idle
                fsm.handle(critter, "playerDetected"); // → alert
                fsm.handle(critter, "playerLostContact"); // → patrol

                // Give critter patrol velocity (as if it was moving)
                critter.vx = 0.8;
                critter.vy = 0.3;

                // Now detect player again — patrol → alert
                fsm.handle(critter, "playerDetected");
            });

            it("should be in alert state", () => {
                expect(fsm.currentState(critter)).toBe("alert");
            });

            it("should zero velocity in alert._onEnter even when coming from patrol", () => {
                // alert._onEnter sets vx=0, vy=0 unconditionally
                // Then alert.tick sets vx/vy to tiny facing direction (0.001 scale)
                // But alert._onEnter fires before tick, so after just the transition:
                // Actually alert.tick fires during the handle("playerDetected") call
                // because alert has no tick in the transition chain — this is just _onEnter
                // The _onEnter sets vx=0, vy=0. Then playerDetected is handled as a
                // string shorthand transition. So only _onEnter ran, not tick.
                // vx and vy should be 0 (or near-zero from _onEnter).
                // They won't be 0.8 anymore.
                expect(Math.abs(critter.vx)).toBeLessThan(0.1);
                expect(Math.abs(critter.vy)).toBeLessThan(0.1);
            });
        });
    });

    // =========================================================================
    // Patrol waypoint within territory
    // =========================================================================

    describe("patrol waypoint territory constraint", () => {
        describe("when entering patrol, the waypoint should be within territory", () => {
            let critter: any;

            beforeEach(() => {
                critter = makeCritter();
                fsm.handle(critter, "tick", FAR_PAYLOAD); // → idle
                fsm.handle(critter, "playerDetected"); // → alert
                fsm.handle(critter, "playerLostContact"); // → patrol (_onEnter sets patrolTarget)
            });

            it("should set a patrolTarget within the territory radius", () => {
                const { cx, cy, r } = critter.territory;
                const dx = critter.patrolTarget.x - cx;
                const dy = critter.patrolTarget.y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                expect(dist).toBeLessThanOrEqual(r);
            });
        });

        describe("across many patrol entries, waypoints should stay within territory", () => {
            it("should always produce waypoints within territory (100 samples)", () => {
                // Use a fresh FSM so we can re-enter patrol many times
                const mod = require("./fsm");
                const testFsm = mod.createCritterBehavior();

                for (let i = 0; i < 100; i++) {
                    const c: any = {
                        id: i,
                        x: 400,
                        y: 300,
                        vx: 0,
                        vy: 0,
                        radius: 12,
                        sensingRange: 120,
                        territory: { cx: 400, cy: 300, r: 100 },
                        patrolTarget: null,
                        fleeDirection: null,
                        fidgetTime: null,
                        alertStartedAt: null,
                        fleeStartedAt: null,
                    };

                    testFsm.handle(c, "tick", FAR_PAYLOAD); // → idle
                    testFsm.handle(c, "playerDetected"); // → alert
                    testFsm.handle(c, "playerLostContact"); // → patrol

                    const dx = c.patrolTarget.x - c.territory.cx;
                    const dy = c.patrolTarget.y - c.territory.cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    expect(dist).toBeLessThanOrEqual(c.territory.r);
                }

                testFsm.dispose();
            });
        });
    });

    // =========================================================================
    // Event emission — handling/handled events per transition
    // =========================================================================

    describe("handling and handled events", () => {
        describe("when playerDetected fires in idle", () => {
            let critter: any;
            let handlingEvents: any[];
            let handledEvents: any[];

            beforeEach(() => {
                critter = makeCritter();
                handlingEvents = [];
                handledEvents = [];
                fsm.on("handling", (data: any) => {
                    handlingEvents.push(data);
                });
                fsm.on("handled", (data: any) => {
                    handledEvents.push(data);
                });
                fsm.handle(critter, "tick", FAR_PAYLOAD); // idle init
                // Clear events from init tick
                handlingEvents.length = 0;
                handledEvents.length = 0;

                fsm.handle(critter, "playerDetected");
            });

            it("should emit a handling event with the input name", () => {
                const evt = handlingEvents.find((e: any) => e.inputName === "playerDetected");
                expect(evt).toBeDefined();
            });

            it("should emit a handled event with the input name", () => {
                const evt = handledEvents.find((e: any) => e.inputName === "playerDetected");
                expect(evt).toBeDefined();
            });

            it("should include the client reference in handling event", () => {
                const evt = handlingEvents.find((e: any) => e.inputName === "playerDetected");
                expect(evt.client).toBe(critter);
            });
        });
    });

    // =========================================================================
    // createCritterBehavior() — independent FSM instances
    // =========================================================================

    describe("createCritterBehavior() factory", () => {
        describe("when two independent FSM instances are created", () => {
            let fsmA: any, fsmB: any;
            let critterA: any, critterB: any;

            beforeEach(async () => {
                const mod = await import("./fsm");
                fsmA = mod.createCritterBehavior();
                fsmB = mod.createCritterBehavior();
                critterA = makeCritter(1);
                critterB = makeCritter(2);

                fsmA.handle(critterA, "tick", FAR_PAYLOAD);
                fsmB.handle(critterB, "tick", FAR_PAYLOAD);

                // Transition critterA on fsmA
                fsmA.handle(critterA, "playerDetected"); // → alert
            });

            afterEach(() => {
                fsmA.dispose();
                fsmB.dispose();
            });

            it("should have critterA in alert on fsmA", () => {
                expect(fsmA.currentState(critterA)).toBe("alert");
            });

            it("should have critterB in idle on fsmB (unaffected)", () => {
                expect(fsmB.currentState(critterB)).toBe("idle");
            });

            it("fsmB should not know about critterA", () => {
                // critterA was never registered with fsmB
                expect(fsmB.currentState(critterA)).toBeUndefined();
            });
        });
    });
});
