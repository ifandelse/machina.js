import { createBehavioralFsm, createFsm } from "machina";
import { createBehavioralFsmSnapshotStore, createFsmSnapshotStore } from "./snapshots";

type CountSnapshot = { state: string; context: { count: number } };
type BehavioralSnapshot = { state: string | undefined; compositeState: string };

const flushMicrotasks = async () => {
    await Promise.resolve();
};

describe("machina-react snapshot stores", () => {
    describe("when a single-client store has no new version", () => {
        let store: ReturnType<typeof createFsmSnapshotStore>;
        let firstSnapshot: unknown;
        let secondSnapshot: unknown;

        beforeEach(() => {
            const fsm = createFsm({
                id: "stable",
                initialState: "idle",
                context: { count: 0 },
                states: {
                    idle: {
                        tick({ ctx }) {
                            ctx.count++;
                        },
                    },
                },
            });
            store = createFsmSnapshotStore(fsm);
            firstSnapshot = store.getSnapshot();
            secondSnapshot = store.getSnapshot();
        });

        it("should return the same snapshot reference", () => {
            expect(secondSnapshot).toBe(firstSnapshot);
        });
    });

    describe("when settled mode receives handled and transitioned in one handle call", () => {
        const listener = jest.fn();
        let store: ReturnType<typeof createFsmSnapshotStore>;
        let initialSnapshot: CountSnapshot;
        let finalSnapshot: CountSnapshot;

        beforeEach(async () => {
            const fsm = createFsm({
                id: "settled",
                initialState: "idle",
                context: { count: 0 },
                states: {
                    idle: {
                        advance({ ctx }) {
                            ctx.count++;
                            return "active";
                        },
                    },
                    active: {},
                },
            });
            store = createFsmSnapshotStore(fsm);
            listener.mockClear();
            store.subscribe(listener);
            initialSnapshot = store.getSnapshot() as CountSnapshot;
            fsm.handle("advance");
            await flushMicrotasks();
            finalSnapshot = store.getSnapshot() as CountSnapshot;
        });

        it("should notify once after the synchronous event burst settles", () => {
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should expose only the final state and context mutation", () => {
            expect(finalSnapshot).not.toBe(initialSnapshot);
            expect(finalSnapshot.state).toBe("active");
            expect(finalSnapshot.context.count).toBe(1);
        });
    });

    describe("when settled mode receives a context-only handled event", () => {
        const listener = jest.fn();
        let store: ReturnType<typeof createFsmSnapshotStore>;
        let snapshot: CountSnapshot;

        beforeEach(async () => {
            const fsm = createFsm({
                id: "handled-only",
                initialState: "idle",
                context: { count: 0 },
                states: {
                    idle: {
                        tick({ ctx }) {
                            ctx.count++;
                        },
                    },
                },
            });
            store = createFsmSnapshotStore(fsm);
            listener.mockClear();
            store.subscribe(listener);
            fsm.handle("tick");
            await flushMicrotasks();
            snapshot = store.getSnapshot() as CountSnapshot;
        });

        it("should notify once", () => {
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should keep the state and expose the updated live context", () => {
            expect(snapshot.state).toBe("idle");
            expect(snapshot.context.count).toBe(1);
        });
    });

    describe("when a settled notification is unsubscribed before the microtask runs", () => {
        const listener = jest.fn();

        beforeEach(async () => {
            const fsm = createFsm({
                id: "unsubscribe-settled",
                initialState: "idle",
                context: { count: 0 },
                states: {
                    idle: {
                        tick({ ctx }) {
                            ctx.count++;
                        },
                    },
                },
            });
            const store = createFsmSnapshotStore(fsm);
            listener.mockClear();
            const unsubscribe = store.subscribe(listener);
            fsm.handle("tick");
            unsubscribe();
            await flushMicrotasks();
        });

        it("should not call the listener after cleanup", () => {
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe("when transitioned mode receives handled-only and transitioned events", () => {
        const listener = jest.fn();

        beforeEach(() => {
            const fsm = createFsm({
                id: "transitioned-mode",
                initialState: "idle",
                context: { count: 0 },
                states: {
                    idle: {
                        tick({ ctx }) {
                            ctx.count++;
                        },
                        advance: "active",
                    },
                    active: {},
                },
            });
            const store = createFsmSnapshotStore(fsm, { rerenderOn: "transitioned" });
            listener.mockClear();
            store.subscribe(listener);
            fsm.handle("tick");
            fsm.handle("advance");
        });

        it("should notify only for the transitioned event", () => {
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe("when handled mode receives a transitioning input", () => {
        const listener = jest.fn();

        beforeEach(() => {
            const fsm = createFsm({
                id: "handled-mode",
                initialState: "idle",
                context: {},
                states: {
                    idle: {
                        advance: "active",
                    },
                    active: {},
                },
            });
            const store = createFsmSnapshotStore(fsm, { rerenderOn: "handled" });
            listener.mockClear();
            store.subscribe(listener);
            fsm.handle("advance");
        });

        it("should notify once from the handled subscription", () => {
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe("when all mode receives handled and transitioned in one handle call", () => {
        const listener = jest.fn();

        beforeEach(() => {
            const fsm = createFsm({
                id: "all",
                initialState: "idle",
                context: {},
                states: {
                    idle: {
                        advance: "active",
                    },
                    active: {},
                },
            });
            const store = createFsmSnapshotStore(fsm, { rerenderOn: "all" });
            listener.mockClear();
            store.subscribe(listener);
            fsm.handle("advance");
        });

        it("should notify immediately for each low-level event", () => {
            expect(listener).toHaveBeenCalledTimes(2);
        });
    });

    describe("when a behavioral store observes an unseen client", () => {
        type Client = { id: string; count: number };
        const states = {
            idle: {
                start: "active",
            },
            active: {
                tick({ ctx }: { ctx: Client }) {
                    ctx.count++;
                },
            },
        } as const;
        const listenerA = jest.fn();
        const listenerB = jest.fn();
        let unseenSnapshot: BehavioralSnapshot;
        let clientASnapshot: BehavioralSnapshot;

        beforeEach(async () => {
            const clientA: Client = { id: "a", count: 0 };
            const clientB: Client = { id: "b", count: 0 };
            const fsm = createBehavioralFsm<Client, typeof states>({
                id: "behavioral",
                initialState: "idle",
                states,
            });
            const storeA = createBehavioralFsmSnapshotStore(fsm, clientA);
            const storeB = createBehavioralFsmSnapshotStore(fsm, clientB);
            listenerA.mockClear();
            listenerB.mockClear();
            storeA.subscribe(listenerA);
            storeB.subscribe(listenerB);
            unseenSnapshot = storeA.getSnapshot();
            fsm.handle(clientA, "start");
            await flushMicrotasks();
            clientASnapshot = storeA.getSnapshot();
        });

        it("should expose undefined state and empty compositeState before initialization", () => {
            expect(unseenSnapshot.state).toBeUndefined();
            expect(unseenSnapshot.compositeState).toBe("");
        });

        it("should notify only subscribers for the matching client", () => {
            expect(listenerA).toHaveBeenCalledTimes(1);
            expect(listenerB).not.toHaveBeenCalled();
        });

        it("should expose the initialized matching-client state", () => {
            expect(clientASnapshot.state).toBe("active");
            expect(clientASnapshot.compositeState).toBe("active");
        });
    });
});
