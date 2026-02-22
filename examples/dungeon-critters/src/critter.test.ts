/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// critter.test.ts — spawnCritters factory tests
//
// Tests the pure factory logic: correct count, valid positions, unique IDs,
// and territory constraints. No FSM involvement here.
// =============================================================================

describe("critter.ts", () => {
    let spawnCritters: any, _resetIdCounter: any;
    let CRITTER_RADIUS_MIN: number, CRITTER_RADIUS_MAX: number, DEFAULT_SENSING_RANGE: number;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        const critterMod = await import("./critter");
        spawnCritters = critterMod.spawnCritters;
        _resetIdCounter = critterMod._resetIdCounter;

        const configMod = await import("./config");
        CRITTER_RADIUS_MIN = configMod.CRITTER_RADIUS_MIN;
        CRITTER_RADIUS_MAX = configMod.CRITTER_RADIUS_MAX;
        DEFAULT_SENSING_RANGE = configMod.DEFAULT_SENSING_RANGE;

        // Reset ID counter so IDs are deterministic per test
        _resetIdCounter();
    });

    // =========================================================================
    // spawnCritters — count
    // =========================================================================

    describe("spawnCritters", () => {
        describe("when called with count 30 and 800x600 bounds", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(30, { width: 800, height: 600 });
            });

            it("should return exactly 30 critters", () => {
                expect(critters).toHaveLength(30);
            });

            it("should assign unique sequential ids starting at 1", () => {
                const ids = critters.map((c: any) => c.id);
                expect(ids).toEqual([...Array(30).keys()].map(i => i + 1));
            });
        });

        // =========================================================================
        // Position constraints
        // =========================================================================

        describe("when spawning critters within 800x600 bounds", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(50, { width: 800, height: 600 });
            });

            it("should place all critters within canvas bounds (padded by radius)", () => {
                for (const critter of critters) {
                    expect(critter.x).toBeGreaterThanOrEqual(critter.radius);
                    expect(critter.x).toBeLessThanOrEqual(800 - critter.radius);
                    expect(critter.y).toBeGreaterThanOrEqual(critter.radius);
                    expect(critter.y).toBeLessThanOrEqual(600 - critter.radius);
                }
            });

            it("should give each critter a radius in the configured range", () => {
                for (const critter of critters) {
                    expect(critter.radius).toBeGreaterThanOrEqual(CRITTER_RADIUS_MIN);
                    expect(critter.radius).toBeLessThanOrEqual(CRITTER_RADIUS_MAX);
                }
            });
        });

        // =========================================================================
        // Territory constraints
        // =========================================================================

        describe("when checking critter territory", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(20, { width: 1024, height: 768 });
            });

            it("should center territory on the spawn position", () => {
                for (const critter of critters) {
                    expect(critter.territory.cx).toBe(critter.x);
                    expect(critter.territory.cy).toBe(critter.y);
                }
            });

            it("should give each critter a territory radius between 80 and 150", () => {
                for (const critter of critters) {
                    expect(critter.territory.r).toBeGreaterThanOrEqual(80);
                    expect(critter.territory.r).toBeLessThanOrEqual(150);
                }
            });
        });

        // =========================================================================
        // Initial state
        // =========================================================================

        describe("when checking critter initial state", () => {
            let critter: any;

            beforeEach(() => {
                [critter] = spawnCritters(1, { width: 500, height: 500 });
            });

            it("should start with zero velocity", () => {
                expect(critter.vx).toBe(0);
                expect(critter.vy).toBe(0);
            });

            it("should start with null timestamps and targets", () => {
                expect(critter.patrolTarget).toBeNull();
                expect(critter.fleeDirection).toBeNull();
                expect(critter.fidgetTime).toBeNull();
                expect(critter.alertStartedAt).toBeNull();
                expect(critter.fleeStartedAt).toBeNull();
            });

            it("should start with the default sensing range", () => {
                expect(critter.sensingRange).toBe(DEFAULT_SENSING_RANGE);
            });
        });

        // =========================================================================
        // ID counter persistence across calls
        // =========================================================================

        describe("when spawnCritters is called twice", () => {
            let firstBatch: any[], secondBatch: any[];

            beforeEach(() => {
                firstBatch = spawnCritters(3, { width: 400, height: 400 });
                secondBatch = spawnCritters(3, { width: 400, height: 400 });
            });

            it("should assign unique ids across both batches (no collisions)", () => {
                const allIds = [...firstBatch, ...secondBatch].map((c: any) => c.id);
                const uniqueIds = new Set(allIds);
                expect(uniqueIds.size).toBe(6);
            });

            it("should continue sequential ids in the second batch", () => {
                expect(secondBatch[0].id).toBe(firstBatch[2].id + 1);
            });
        });

        // =========================================================================
        // Count of zero
        // =========================================================================

        describe("when called with count 0", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(0, { width: 800, height: 600 });
            });

            it("should return an empty array", () => {
                expect(critters).toHaveLength(0);
            });
        });

        // =========================================================================
        // HARDENING TESTS — boundary conditions, failure modes, edge cases
        // =========================================================================

        // =========================================================================
        // Negative and zero-adjacent counts
        // =========================================================================

        describe("when called with a negative count", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(-1, { width: 800, height: 600 });
            });

            it("should return an empty array for negative count", () => {
                // for (let i = 0; i < -1; i++) never executes
                expect(critters).toHaveLength(0);
            });

            it("should not advance the ID counter for negative count", () => {
                // After -1, next spawn should still start from 1
                const nextBatch = spawnCritters(1, { width: 800, height: 600 });
                expect(nextBatch[0].id).toBe(1);
            });
        });

        describe("when called with count 1", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(1, { width: 800, height: 600 });
            });

            it("should return exactly 1 critter", () => {
                expect(critters).toHaveLength(1);
            });

            it("should assign id 1 to the first critter after reset", () => {
                expect(critters[0].id).toBe(1);
            });

            it("should have a valid territory centered on spawn position", () => {
                expect(critters[0].territory.cx).toBe(critters[0].x);
                expect(critters[0].territory.cy).toBe(critters[0].y);
            });
        });

        // =========================================================================
        // Float (non-integer) count
        // =========================================================================

        describe("when called with a float count like 2.9", () => {
            let critters: any[];

            beforeEach(() => {
                critters = spawnCritters(2.9, { width: 800, height: 600 });
            });

            it("should effectively spawn 3 critters (loop runs while i < 2.9, so i=0,1,2)", () => {
                // for (let i = 0; i < 2.9; i++) — i=0, i=1, i=2 all pass, i=3 fails
                // Float counts are not rounded — the loop's numeric comparison decides
                expect(critters).toHaveLength(3);
            });
        });

        // =========================================================================
        // Minimum canvas dimensions — padding boundary
        // =========================================================================

        describe("when canvas is large enough for padding", () => {
            it("should place critters within bounds for exactly minimum viable canvas", () => {
                // padding = radius + 10 ≈ 20-25. Canvas of 100x100 is safely larger.
                const critters = spawnCritters(20, { width: 100, height: 100 });
                for (const critter of critters) {
                    expect(critter.x).toBeGreaterThanOrEqual(0);
                    expect(critter.x).toBeLessThanOrEqual(100);
                    expect(critter.y).toBeGreaterThanOrEqual(0);
                    expect(critter.y).toBeLessThanOrEqual(100);
                }
            });
        });

        // =========================================================================
        // Territory radius range — exact bounds
        // =========================================================================

        describe("territory radius range across many spawns", () => {
            it("should always produce territory radius in [80, 150] across 200 critters", () => {
                // 80 + Math.random() * 70 → [80, 150]
                const critters = spawnCritters(200, { width: 2000, height: 2000 });
                for (const critter of critters) {
                    expect(critter.territory.r).toBeGreaterThanOrEqual(80);
                    expect(critter.territory.r).toBeLessThanOrEqual(150);
                }
            });
        });

        // =========================================================================
        // Critter radius range — exact bounds
        // =========================================================================

        describe("critter radius range across many spawns", () => {
            it("should always produce radius in [CRITTER_RADIUS_MIN, CRITTER_RADIUS_MAX]", () => {
                const critters = spawnCritters(200, { width: 2000, height: 2000 });
                for (const critter of critters) {
                    expect(critter.radius).toBeGreaterThanOrEqual(CRITTER_RADIUS_MIN);
                    expect(critter.radius).toBeLessThanOrEqual(CRITTER_RADIUS_MAX);
                }
            });
        });

        // =========================================================================
        // ID counter: _resetIdCounter restarts from 1
        // =========================================================================

        describe("when _resetIdCounter is called between two spawns", () => {
            let first: any[], second: any[];

            beforeEach(() => {
                first = spawnCritters(3, { width: 400, height: 400 });
                _resetIdCounter();
                second = spawnCritters(3, { width: 400, height: 400 });
            });

            it("should restart IDs from 1 after reset", () => {
                expect(second[0].id).toBe(1);
            });

            it("should produce duplicate IDs across batches after reset", () => {
                // This is intentional — _resetIdCounter is a test utility
                // The IDs within each batch are unique, but cross-batch they collide
                const firstIds = new Set(first.map((c: any) => c.id));
                const secondIds = new Set(second.map((c: any) => c.id));
                // They should overlap (1, 2, 3 in both)
                const overlap = [...firstIds].filter(id => secondIds.has(id));
                expect(overlap).toHaveLength(3);
            });
        });

        // =========================================================================
        // Each critter has a unique object reference (no shared state)
        // =========================================================================

        describe("when multiple critters are spawned", () => {
            it("should give each critter a distinct territory object (not shared ref)", () => {
                const critters = spawnCritters(3, { width: 800, height: 600 });
                const [a, b, c] = critters;
                // Mutating one territory should not affect the others
                a.territory.cx = 9999;
                expect(b.territory.cx).not.toBe(9999);
                expect(c.territory.cx).not.toBe(9999);
            });
        });

        // =========================================================================
        // Large spawn count — performance and correctness
        // =========================================================================

        describe("when spawning the maximum allowed critters (MAX_CRITTERS)", () => {
            let critters: any[];
            let MAX_CRITTERS: number;

            beforeEach(async () => {
                const configMod = await import("./config");
                MAX_CRITTERS = configMod.MAX_CRITTERS;
                critters = spawnCritters(MAX_CRITTERS, { width: 1920, height: 1080 });
            });

            it("should produce exactly MAX_CRITTERS critters", () => {
                expect(critters).toHaveLength(MAX_CRITTERS);
            });

            it("should assign unique ids to all MAX_CRITTERS critters", () => {
                const ids = new Set(critters.map((c: any) => c.id));
                expect(ids.size).toBe(MAX_CRITTERS);
            });

            it("should keep all critters within 1920x1080 bounds", () => {
                for (const critter of critters) {
                    expect(critter.x).toBeGreaterThanOrEqual(0);
                    expect(critter.x).toBeLessThanOrEqual(1920);
                    expect(critter.y).toBeGreaterThanOrEqual(0);
                    expect(critter.y).toBeLessThanOrEqual(1080);
                }
            });
        });
    });
});
