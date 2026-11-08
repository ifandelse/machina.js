/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import type { ClientMeta } from "./types";

type Device = { deviceId: string };
type ConnState = "online" | "offline";

const ROUTER: Device = { deviceId: "ROUTER_8675309" };
const SWITCH: Device = { deviceId: "SWITCH_90210" };
const ONLINE_RECORD: ClientMeta<ConnState> = { state: "online", deferredQueue: [] };
const OFFLINE_RECORD: ClientMeta<ConnState> = {
    state: "offline",
    deferredQueue: [{ inputName: "heartbeat", args: [] }],
};

// The registry calls `new WeakRef(client)` at write time and `deref()` at
// enumeration time. A collected client can't be produced on demand in Jest,
// so the dead-ref branch swaps in a WeakRef whose deref() is this mock.
const mockDeref = jest.fn();
const RealWeakRef = globalThis.WeakRef;
class FakeWeakRef<T extends object> {
    constructor(private readonly target: T) {}
    deref(): T | undefined {
        return mockDeref(this.target);
    }
}

describe("ClientRegistry", () => {
    let ClientRegistry: typeof import("./client-registry").ClientRegistry,
        registry: InstanceType<typeof ClientRegistry<Device, ConnState>>;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        ({ ClientRegistry } = await import("./client-registry"));
        registry = new ClientRegistry<Device, ConnState>();
    });

    describe("get", () => {
        describe("when the client was never written", () => {
            let result: ClientMeta<ConnState> | undefined;

            beforeEach(() => {
                result = registry.get(ROUTER);
            });

            it("should return undefined", () => {
                expect(result).toBeUndefined();
            });
        });

        describe("when the client was written", () => {
            let result: ClientMeta<ConnState> | undefined;

            beforeEach(() => {
                registry.set(ROUTER, ONLINE_RECORD);
                result = registry.get(ROUTER);
            });

            it("should return the record", () => {
                expect(result).toEqual(ONLINE_RECORD);
            });
        });
    });

    describe("has", () => {
        describe("when the client was never written", () => {
            let result: boolean;

            beforeEach(() => {
                result = registry.has(ROUTER);
            });

            it("should return false", () => {
                expect(result).toBe(false);
            });
        });

        describe("when the client was written", () => {
            let result: boolean;

            beforeEach(() => {
                registry.set(ROUTER, ONLINE_RECORD);
                result = registry.has(ROUTER);
            });

            it("should return true", () => {
                expect(result).toBe(true);
            });
        });
    });

    describe("stateOf", () => {
        describe("when the client was never written", () => {
            let result: ConnState | undefined;

            beforeEach(() => {
                result = registry.stateOf(ROUTER);
            });

            it("should return undefined", () => {
                expect(result).toBeUndefined();
            });
        });

        describe("when the client was written", () => {
            let result: ConnState | undefined;

            beforeEach(() => {
                registry.set(ROUTER, OFFLINE_RECORD);
                result = registry.stateOf(ROUTER);
            });

            it("should return the record's state", () => {
                expect(result).toBe("offline");
            });
        });
    });

    describe("set", () => {
        describe("when the client is written for the first time", () => {
            let live: Device[];

            beforeEach(() => {
                registry.set(ROUTER, ONLINE_RECORD);
                live = [...registry.liveClients()];
            });

            it("should add the client to the live set once", () => {
                expect(live).toEqual([ROUTER]);
            });
        });

        describe("when the client is written a second time", () => {
            let live: Device[], result: ClientMeta<ConnState> | undefined;

            beforeEach(() => {
                registry.set(ROUTER, ONLINE_RECORD);
                registry.set(ROUTER, OFFLINE_RECORD);
                live = [...registry.liveClients()];
                result = registry.get(ROUTER);
            });

            it("should replace the record", () => {
                expect(result).toEqual(OFFLINE_RECORD);
            });

            it("should keep a single entry in the live set", () => {
                expect(live).toEqual([ROUTER]);
            });
        });
    });

    describe("liveClients", () => {
        describe("when no client was written", () => {
            let live: Device[];

            beforeEach(() => {
                live = [...registry.liveClients()];
            });

            it("should yield nothing", () => {
                expect(live).toEqual([]);
            });
        });

        describe("when two clients are live", () => {
            let live: Device[];

            beforeEach(() => {
                registry.set(SWITCH, OFFLINE_RECORD);
                registry.set(ROUTER, ONLINE_RECORD);
                live = [...registry.liveClients()];
            });

            it("should yield both in first-seen order", () => {
                expect(live).toEqual([SWITCH, ROUTER]);
            });
        });

        describe("when one client has been collected", () => {
            let firstPass: Device[], secondPass: Device[];

            beforeEach(() => {
                (globalThis as any).WeakRef = FakeWeakRef;
                mockDeref.mockImplementation((target: Device) =>
                    target === SWITCH ? undefined : target
                );
                registry.set(SWITCH, OFFLINE_RECORD);
                registry.set(ROUTER, ONLINE_RECORD);
                firstPass = [...registry.liveClients()];
                secondPass = [...registry.liveClients()];
            });

            afterEach(() => {
                (globalThis as any).WeakRef = RealWeakRef;
            });

            it("should skip the collected client", () => {
                expect(firstPass).toEqual([ROUTER]);
            });

            it("should prune the dead reference so later passes never deref it again", () => {
                expect(secondPass).toEqual([ROUTER]);
                expect(mockDeref).toHaveBeenCalledTimes(3);
                expect(mockDeref).toHaveBeenNthCalledWith(1, SWITCH);
                expect(mockDeref).toHaveBeenNthCalledWith(2, ROUTER);
                expect(mockDeref).toHaveBeenNthCalledWith(3, ROUTER);
            });
        });
    });
});
