export default {};

import type { ChildMounts } from "./mount-table";
import type { ChildLink, ClientSnapshot, MachinaType } from "./types";

type Device = { deviceId: string };
type ConnState = "online" | "degraded" | "offline";

const ROUTER: Device = { deviceId: "ROUTER_8675309" };
const SWITCH: Device = { deviceId: "SWITCH_90210" };
const ACCESS_POINT: Device = { deviceId: "AP_1138" };
const HEARTBEAT_ARGS = [{ rssi: -42 }];
const LINK_SNAPSHOT: ClientSnapshot = { state: "handshake", deferred: [] };

const mockBubble = jest.fn();
const mockRelay = jest.fn();

// A child the table can mount: stamped with the discriminant, every method
// the two adapters call is a mock, and `emit` plays the child's wildcard
// relay so a scenario can fire an event after the table has subscribed.
type FakeChild = {
    initialState: string;
    canHandle: jest.Mock;
    handle: jest.Mock;
    transition: jest.Mock;
    reset: jest.Mock;
    compositeState: jest.Mock;
    rehydrate: jest.Mock;
    dehydrate: jest.Mock;
    planSnapshotWrites: jest.Mock;
    dispose: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
    emit: (eventName: string, data: unknown) => void;
    [key: symbol]: MachinaType;
};

// `typeKey` is the MACHINA_TYPE symbol from the module graph under test.
// jest.resetModules() gives the table a fresh ./types, and a fresh Symbol()
// with it, so a statically imported symbol would never match.
const makeChild = (kind: MachinaType, typeKey: symbol): FakeChild => {
    const listeners = new Set<(eventName: string, data: unknown) => void>();
    const off = jest.fn();
    return {
        [typeKey]: kind,
        initialState: "idle",
        canHandle: jest.fn(),
        handle: jest.fn(),
        transition: jest.fn(),
        reset: jest.fn(),
        compositeState: jest.fn(),
        rehydrate: jest.fn(),
        dehydrate: jest.fn(),
        planSnapshotWrites: jest.fn(),
        dispose: jest.fn(),
        off,
        on: jest.fn((_eventName: string, callback: (eventName: string, data: unknown) => void) => {
            listeners.add(callback);
            return {
                off: () => {
                    off();
                    listeners.delete(callback);
                },
            };
        }),
        emit: (eventName, data) => {
            for (const callback of [...listeners]) {
                callback(eventName, data);
            }
        },
    };
};

describe("MountTable", () => {
    let MountTable: typeof import("./mount-table").MountTable,
        ClientRegistry: typeof import("./client-registry").ClientRegistry,
        MACHINA_TYPE: typeof import("./types").MACHINA_TYPE,
        registry: InstanceType<typeof ClientRegistry<Device, ConnState>>,
        link: FakeChild,
        states: Record<string, Record<string, unknown>>,
        table: InstanceType<typeof MountTable<Device, ConnState>>;

    const buildTable = () =>
        new MountTable<Device, ConnState>(states, registry, {
            bubble: mockBubble,
            relay: mockRelay,
        });

    const place = (client: Device, state: ConnState) => {
        registry.set(client, { state, deferredQueue: [] });
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        ({ MountTable } = await import("./mount-table"));
        ({ ClientRegistry } = await import("./client-registry"));
        ({ MACHINA_TYPE } = await import("./types"));
        registry = new ClientRegistry<Device, ConnState>();
        link = makeChild("BehavioralFsm", MACHINA_TYPE);
        states = { online: { _child: link, heartbeat: "online" }, offline: {} };
    });

    describe("constructor", () => {
        describe("when a state mounts a BehavioralFsm instance", () => {
            let onlineMount: ChildLink | undefined, offlineMount: ChildLink | undefined;

            beforeEach(() => {
                table = buildTable();
                onlineMount = table.mountAt("online");
                offlineMount = table.mountAt("offline");
            });

            it("should install an adapter over the raw child in place", () => {
                expect(states.online._child).not.toBe(link);
                expect((states.online._child as ChildMounts["childLink"]).instance).toBe(link);
            });

            it("should expose the installed adapter through mountAt", () => {
                expect(onlineMount).toBe(states.online._child);
            });

            it("should return undefined from mountAt for a state without a child", () => {
                expect(offlineMount).toBeUndefined();
            });

            it("should open one wildcard subscription on the child", () => {
                expect(link.on).toHaveBeenCalledTimes(1);
                expect(link.on).toHaveBeenCalledWith("*", expect.any(Function));
            });
        });

        describe("when a state mounts an Fsm instance", () => {
            let onlineMount: ChildLink | undefined;

            beforeEach(() => {
                link = makeChild("Fsm", MACHINA_TYPE);
                states = { online: { _child: link }, offline: {} };
                table = buildTable();
                onlineMount = table.mountAt("online");
            });

            it("should install an adapter over the raw child in place", () => {
                expect(onlineMount?.instance).toBe(link);
            });

            it("should open one wildcard subscription on the child", () => {
                expect(link.on).toHaveBeenCalledTimes(1);
                expect(link.on).toHaveBeenCalledWith("*", expect.any(Function));
            });
        });

        describe("when two states mount the same child", () => {
            let mounts: ChildMounts[], degradedMount: ChildLink | undefined;

            beforeEach(() => {
                states = { online: { _child: link }, degraded: { _child: link }, offline: {} };
                table = buildTable();
                mounts = table.mountsByChild();
                degradedMount = table.mountAt("degraded");
            });

            it("should subscribe to the child once", () => {
                expect(link.on).toHaveBeenCalledTimes(1);
            });

            it("should group both state names under the one child", () => {
                expect(mounts).toEqual([
                    { childLink: states.online._child, stateNames: ["online", "degraded"] },
                ]);
            });

            it("should resolve both mounts to the same instance", () => {
                expect(degradedMount?.instance).toBe(link);
            });
        });

        describe("when two states mount different children", () => {
            let uplink: FakeChild, mounts: ChildMounts[];

            beforeEach(() => {
                uplink = makeChild("Fsm", MACHINA_TYPE);
                states = { online: { _child: link }, degraded: { _child: uplink }, offline: {} };
                table = buildTable();
                mounts = table.mountsByChild();
            });

            it("should subscribe to each child once", () => {
                expect(link.on).toHaveBeenCalledTimes(1);
                expect(uplink.on).toHaveBeenCalledTimes(1);
            });

            it("should list one group per child in install order", () => {
                expect(mounts).toEqual([
                    { childLink: states.online._child, stateNames: ["online"] },
                    { childLink: states.degraded._child, stateNames: ["degraded"] },
                ]);
            });
        });

        describe("when _child is a primitive", () => {
            let error: unknown;

            beforeEach(() => {
                states = { online: { _child: 42 } };
                try {
                    buildTable();
                } catch (thrown) {
                    error = thrown;
                }
            });

            it("should throw naming the state and the value", () => {
                expect(error).toEqual(
                    new Error(
                        'State "online"._child: expected an Fsm or BehavioralFsm instance, got 42'
                    )
                );
            });
        });

        describe("when _child is a plain object", () => {
            let error: unknown;

            beforeEach(() => {
                states = { online: { _child: { initialState: "idle" } } };
                try {
                    buildTable();
                } catch (thrown) {
                    error = thrown;
                }
            });

            it("should throw naming the state", () => {
                expect(error).toEqual(
                    new Error(
                        'State "online"._child: expected an Fsm or BehavioralFsm instance, got a plain object'
                    )
                );
            });
        });

        describe("when _child carries an unknown MACHINA_TYPE", () => {
            let error: unknown;

            beforeEach(() => {
                states = { online: { _child: { [MACHINA_TYPE]: "Pager" } } };
                try {
                    buildTable();
                } catch (thrown) {
                    error = thrown;
                }
            });

            it("should throw naming the state and the discriminant", () => {
                expect(error).toEqual(
                    new Error(
                        'State "online"._child: expected an Fsm or BehavioralFsm instance, got [MACHINA_TYPE] = Pager'
                    )
                );
            });
        });

        describe("when the caller deletes _child from a state after construction", () => {
            let mount: ChildLink | undefined, delegated: boolean;

            beforeEach(() => {
                link.canHandle.mockReturnValue(true);
                table = buildTable();
                delete states.online._child;
                mount = table.mountAt("online");
                delegated = table.delegate(ROUTER, "online", "heartbeat", HEARTBEAT_ARGS);
            });

            // The table reads `_child` once, in the constructor. Machina does not
            // support mutating state objects after the FSM exists, so a later
            // delete does not unmount the child. Before the mount table the engine
            // read `_child` on every call and a delete did unmount it. This pins
            // the new behaviour so a future change to it is a deliberate one.
            it("should still resolve the mount", () => {
                expect(mount?.instance).toBe(link);
            });

            it("should still delegate to the child", () => {
                expect(delegated).toBe(true);
                expect(link.handle).toHaveBeenCalledTimes(1);
                expect(link.handle).toHaveBeenCalledWith(ROUTER, "heartbeat", ...HEARTBEAT_ARGS);
            });
        });
    });

    describe("delegate", () => {
        let result: boolean;

        describe("when the state has no mount", () => {
            beforeEach(() => {
                table = buildTable();
                result = table.delegate(ROUTER, "offline", "heartbeat", HEARTBEAT_ARGS);
            });

            it("should return false", () => {
                expect(result).toBe(false);
            });
        });

        describe("when the child declines the input", () => {
            beforeEach(() => {
                link.canHandle.mockReturnValue(false);
                table = buildTable();
                result = table.delegate(ROUTER, "online", "heartbeat", HEARTBEAT_ARGS);
            });

            it("should return false", () => {
                expect(result).toBe(false);
            });

            it("should ask the child with the client", () => {
                expect(link.canHandle).toHaveBeenCalledTimes(1);
                expect(link.canHandle).toHaveBeenCalledWith(ROUTER, "heartbeat");
            });

            it("should not forward the input", () => {
                expect(link.handle).not.toHaveBeenCalled();
            });
        });

        describe("when a BehavioralFsm child accepts the input", () => {
            beforeEach(() => {
                link.canHandle.mockReturnValue(true);
                table = buildTable();
                result = table.delegate(ROUTER, "online", "heartbeat", HEARTBEAT_ARGS);
            });

            it("should return true", () => {
                expect(result).toBe(true);
            });

            it("should forward the input with the client and spread args", () => {
                expect(link.handle).toHaveBeenCalledTimes(1);
                expect(link.handle).toHaveBeenCalledWith(ROUTER, "heartbeat", ...HEARTBEAT_ARGS);
            });
        });

        describe("when an Fsm child accepts the input", () => {
            beforeEach(() => {
                link = makeChild("Fsm", MACHINA_TYPE);
                link.canHandle.mockReturnValue(true);
                states = { online: { _child: link } };
                table = buildTable();
                result = table.delegate(ROUTER, "online", "heartbeat", HEARTBEAT_ARGS);
            });

            it("should return true", () => {
                expect(result).toBe(true);
            });

            it("should ask the child without a client", () => {
                expect(link.canHandle).toHaveBeenCalledTimes(1);
                expect(link.canHandle).toHaveBeenCalledWith("heartbeat");
            });

            it("should forward the input without a client", () => {
                expect(link.handle).toHaveBeenCalledTimes(1);
                expect(link.handle).toHaveBeenCalledWith("heartbeat", ...HEARTBEAT_ARGS);
            });
        });
    });

    describe("canHandle", () => {
        let result: boolean;

        describe("when the state has no mount", () => {
            beforeEach(() => {
                table = buildTable();
                result = table.canHandle(ROUTER, "offline", "heartbeat");
            });

            it("should return false", () => {
                expect(result).toBe(false);
            });
        });

        describe("when the mount is a BehavioralFsm", () => {
            beforeEach(() => {
                link.canHandle.mockReturnValue(true);
                table = buildTable();
                result = table.canHandle(ROUTER, "online", "heartbeat");
            });

            it("should return the child's answer", () => {
                expect(result).toBe(true);
            });

            it("should ask the child with the client", () => {
                expect(link.canHandle).toHaveBeenCalledTimes(1);
                expect(link.canHandle).toHaveBeenCalledWith(ROUTER, "heartbeat");
            });
        });

        describe("when the mount is an Fsm", () => {
            beforeEach(() => {
                link = makeChild("Fsm", MACHINA_TYPE);
                link.canHandle.mockReturnValue(true);
                states = { online: { _child: link } };
                table = buildTable();
                result = table.canHandle(ROUTER, "online", "heartbeat");
            });

            it("should return the child's answer", () => {
                expect(result).toBe(true);
            });

            it("should ask the child without a client", () => {
                expect(link.canHandle).toHaveBeenCalledTimes(1);
                expect(link.canHandle).toHaveBeenCalledWith("heartbeat");
            });
        });
    });

    describe("resetAt", () => {
        describe("when the state has no mount", () => {
            beforeEach(() => {
                table = buildTable();
                table.resetAt(ROUTER, "offline");
            });

            it("should not touch the child", () => {
                expect(link.transition).not.toHaveBeenCalled();
                expect(link.reset).not.toHaveBeenCalled();
            });
        });

        describe("when the mount is a BehavioralFsm", () => {
            beforeEach(() => {
                table = buildTable();
                table.resetAt(ROUTER, "online");
            });

            it("should transition the client to the child's initial state", () => {
                expect(link.transition).toHaveBeenCalledTimes(1);
                expect(link.transition).toHaveBeenCalledWith(ROUTER, "idle");
            });
        });

        describe("when the mount is an Fsm", () => {
            beforeEach(() => {
                link = makeChild("Fsm", MACHINA_TYPE);
                states = { online: { _child: link } };
                table = buildTable();
                table.resetAt(ROUTER, "online");
            });

            it("should reset the child without a client", () => {
                expect(link.reset).toHaveBeenCalledTimes(1);
                expect(link.reset).toHaveBeenCalledWith();
            });
        });
    });

    describe("pathAt", () => {
        let result: string;

        describe("when the state has no mount", () => {
            beforeEach(() => {
                table = buildTable();
                result = table.pathAt(ROUTER, "offline");
            });

            it("should return an empty path", () => {
                expect(result).toBe("");
            });
        });

        describe("when the mount is a BehavioralFsm", () => {
            beforeEach(() => {
                link.compositeState.mockReturnValue("connecting.handshake");
                table = buildTable();
                result = table.pathAt(ROUTER, "online");
            });

            it("should return the child's composite path", () => {
                expect(result).toBe("connecting.handshake");
            });

            it("should ask the child with the client", () => {
                expect(link.compositeState).toHaveBeenCalledTimes(1);
                expect(link.compositeState).toHaveBeenCalledWith(ROUTER);
            });
        });

        describe("when the mount is an Fsm", () => {
            beforeEach(() => {
                link = makeChild("Fsm", MACHINA_TYPE);
                link.compositeState.mockReturnValue("connecting");
                states = { online: { _child: link } };
                table = buildTable();
                result = table.pathAt(ROUTER, "online");
            });

            it("should return the child's composite path", () => {
                expect(result).toBe("connecting");
            });

            it("should ask the child without a client", () => {
                expect(link.compositeState).toHaveBeenCalledTimes(1);
                expect(link.compositeState).toHaveBeenCalledWith();
            });
        });
    });

    describe("dispose", () => {
        describe("when a shared child is disposed with the defaults", () => {
            beforeEach(() => {
                states = { online: { _child: link }, degraded: { _child: link } };
                table = buildTable();
                table.dispose();
            });

            it("should close the one subscription", () => {
                expect(link.off).toHaveBeenCalledTimes(1);
            });

            it("should dispose the child once", () => {
                expect(link.dispose).toHaveBeenCalledTimes(1);
            });
        });

        describe("when preserveChildren is set", () => {
            beforeEach(() => {
                table = buildTable();
                table.dispose({ preserveChildren: true });
            });

            it("should close the subscription", () => {
                expect(link.off).toHaveBeenCalledTimes(1);
            });

            it("should leave the child alive", () => {
                expect(link.dispose).not.toHaveBeenCalled();
            });
        });

        describe("when one of two children throws", () => {
            const UPLINK_FAILURE = new Error("E_SOGGY_UPLINK");
            let uplink: FakeChild, error: unknown;

            beforeEach(() => {
                uplink = makeChild("Fsm", MACHINA_TYPE);
                link.dispose.mockImplementation(() => {
                    throw UPLINK_FAILURE;
                });
                states = { online: { _child: link }, degraded: { _child: uplink } };
                table = buildTable();
                try {
                    table.dispose();
                } catch (thrown) {
                    error = thrown;
                }
            });

            it("should still dispose the later child", () => {
                expect(uplink.dispose).toHaveBeenCalledTimes(1);
            });

            it("should rethrow the failure inside one AggregateError", () => {
                expect(error).toBeInstanceOf(AggregateError);
                expect((error as AggregateError).errors).toEqual([UPLINK_FAILURE]);
                expect((error as AggregateError).message).toBe(
                    "1 child FSM(s) threw from dispose()"
                );
            });
        });
    });

    describe("unhandled input from a BehavioralFsm child", () => {
        describe("when the client's state mounts the child", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "online");
                link.emit("nohandler", {
                    inputName: "heartbeat",
                    args: HEARTBEAT_ARGS,
                    client: ROUTER,
                });
            });

            it("should bubble once for that client", () => {
                expect(mockBubble).toHaveBeenCalledTimes(1);
                expect(mockBubble).toHaveBeenCalledWith(ROUTER, "heartbeat", HEARTBEAT_ARGS);
            });

            it("should not relay the nohandler as an event", () => {
                expect(mockRelay).not.toHaveBeenCalled();
            });
        });

        describe("when the client's state does not mount the child", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "offline");
                link.emit("nohandler", {
                    inputName: "heartbeat",
                    args: HEARTBEAT_ARGS,
                    client: ROUTER,
                });
            });

            it("should not bubble", () => {
                expect(mockBubble).not.toHaveBeenCalled();
            });
        });

        describe("when the client is unknown to the registry", () => {
            beforeEach(() => {
                table = buildTable();
                link.emit("nohandler", {
                    inputName: "heartbeat",
                    args: HEARTBEAT_ARGS,
                    client: ROUTER,
                });
            });

            it("should not bubble", () => {
                expect(mockBubble).not.toHaveBeenCalled();
            });
        });

        describe("when the payload carries no args", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "online");
                link.emit("nohandler", { inputName: "heartbeat", client: ROUTER });
            });

            it("should bubble with an empty args list", () => {
                expect(mockBubble).toHaveBeenCalledTimes(1);
                expect(mockBubble).toHaveBeenCalledWith(ROUTER, "heartbeat", []);
            });
        });
    });

    describe("unhandled input from an Fsm child", () => {
        beforeEach(() => {
            link = makeChild("Fsm", MACHINA_TYPE);
            states = { online: { _child: link }, offline: {} };
        });

        describe("when live clients sit in mounting and non-mounting states", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "online");
                place(SWITCH, "offline");
                place(ACCESS_POINT, "online");
                link.emit("nohandler", { inputName: "heartbeat", args: HEARTBEAT_ARGS });
            });

            it("should bubble once per client in a mounting state", () => {
                expect(mockBubble).toHaveBeenCalledTimes(2);
                expect(mockBubble).toHaveBeenNthCalledWith(1, ROUTER, "heartbeat", HEARTBEAT_ARGS);
                expect(mockBubble).toHaveBeenNthCalledWith(
                    2,
                    ACCESS_POINT,
                    "heartbeat",
                    HEARTBEAT_ARGS
                );
            });
        });

        describe("when no live client is in a mounting state", () => {
            beforeEach(() => {
                table = buildTable();
                place(SWITCH, "offline");
                link.emit("nohandler", { inputName: "heartbeat", args: HEARTBEAT_ARGS });
            });

            it("should not bubble", () => {
                expect(mockBubble).not.toHaveBeenCalled();
            });
        });
    });

    describe("built-in event from a BehavioralFsm child", () => {
        const TRANSITIONED = { fromState: "idle", toState: "handshake", client: ROUTER };

        describe("when the client's state mounts the child", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "online");
                link.emit("transitioned", TRANSITIONED);
            });

            it("should relay the event once with its payload", () => {
                expect(mockRelay).toHaveBeenCalledTimes(1);
                expect(mockRelay).toHaveBeenCalledWith("transitioned", TRANSITIONED);
            });

            it("should not bubble", () => {
                expect(mockBubble).not.toHaveBeenCalled();
            });
        });

        describe("when the client's state does not mount the child", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "offline");
                place(SWITCH, "online");
                link.emit("transitioned", TRANSITIONED);
            });

            it("should drop the event even though another client mounts the child", () => {
                expect(mockRelay).not.toHaveBeenCalled();
            });
        });
    });

    describe("custom event from a BehavioralFsm child", () => {
        // A custom payload is the user's data: this `client` key must not be
        // read as the parent's client (#183).
        const SIGNAL_DROP = { client: ROUTER, level: 3 };

        describe("when several live clients are in mounting states", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "offline");
                place(SWITCH, "online");
                place(ACCESS_POINT, "online");
                link.emit("signalDrop", SIGNAL_DROP);
            });

            it("should relay exactly once", () => {
                expect(mockRelay).toHaveBeenCalledTimes(1);
                expect(mockRelay).toHaveBeenCalledWith("signalDrop", SIGNAL_DROP);
            });
        });

        describe("when no live client is in a mounting state", () => {
            beforeEach(() => {
                table = buildTable();
                place(ROUTER, "offline");
                link.emit("signalDrop", SIGNAL_DROP);
            });

            it("should not relay", () => {
                expect(mockRelay).not.toHaveBeenCalled();
            });
        });
    });

    describe("built-in event from an Fsm child", () => {
        const TRANSITIONED = { fromState: "idle", toState: "handshake" };

        beforeEach(() => {
            link = makeChild("Fsm", MACHINA_TYPE);
            states = { online: { _child: link }, offline: {} };
            table = buildTable();
            place(ROUTER, "online");
            link.emit("transitioned", TRANSITIONED);
        });

        it("should relay once because a live client mounts the child", () => {
            expect(mockRelay).toHaveBeenCalledTimes(1);
            expect(mockRelay).toHaveBeenCalledWith("transitioned", TRANSITIONED);
        });
    });

    describe("persistence through the installed adapter", () => {
        describe("when the mount is a BehavioralFsm", () => {
            const WRITE_THUNKS = [jest.fn()];
            let snapshot: ClientSnapshot | undefined, thunks: Array<() => void>;

            beforeEach(() => {
                link.dehydrate.mockReturnValue(LINK_SNAPSHOT);
                link.planSnapshotWrites.mockReturnValue(WRITE_THUNKS);
                table = buildTable();
                const mount = table.mountAt("online")!;
                mount.rehydrate(ROUTER, "connecting.handshake");
                snapshot = mount.dehydrate(ROUTER, true);
                thunks = mount.planRehydrate(ROUTER, LINK_SNAPSHOT);
            });

            it("should pass rehydrate through with the client", () => {
                expect(link.rehydrate).toHaveBeenCalledTimes(1);
                expect(link.rehydrate).toHaveBeenCalledWith(ROUTER, "connecting.handshake");
            });

            it("should pass dehydrate through and return the child's snapshot", () => {
                expect(link.dehydrate).toHaveBeenCalledTimes(1);
                expect(link.dehydrate).toHaveBeenCalledWith(ROUTER, true);
                expect(snapshot).toEqual(LINK_SNAPSHOT);
            });

            it("should plan writes through planSnapshotWrites", () => {
                expect(link.planSnapshotWrites).toHaveBeenCalledTimes(1);
                expect(link.planSnapshotWrites).toHaveBeenCalledWith(ROUTER, LINK_SNAPSHOT);
                expect(thunks).toEqual(WRITE_THUNKS);
            });
        });

        describe("when the mount is an Fsm", () => {
            const REHYDRATE_MESSAGE =
                "rehydrate: cannot rehydrate an Fsm child. Fsm owns its own context; " +
                "rehydrate is only valid for BehavioralFsm hierarchies.";
            let rehydrateError: unknown, dehydrateError: unknown, planError: unknown;

            beforeEach(() => {
                link = makeChild("Fsm", MACHINA_TYPE);
                states = { online: { _child: link } };
                table = buildTable();
                const mount = table.mountAt("online")!;
                try {
                    mount.rehydrate(ROUTER, "connecting");
                } catch (thrown) {
                    rehydrateError = thrown;
                }
                try {
                    mount.dehydrate(ROUTER, true);
                } catch (thrown) {
                    dehydrateError = thrown;
                }
                try {
                    mount.planRehydrate(ROUTER, LINK_SNAPSHOT);
                } catch (thrown) {
                    planError = thrown;
                }
            });

            it("should refuse to rehydrate", () => {
                expect(rehydrateError).toEqual(new Error(REHYDRATE_MESSAGE));
            });

            it("should refuse to dehydrate", () => {
                expect(dehydrateError).toEqual(
                    new Error(
                        "dehydrate: cannot dehydrate an Fsm child. Fsm owns its own context; " +
                            "dehydrate is only valid for BehavioralFsm hierarchies."
                    )
                );
            });

            it("should refuse to plan a rehydrate", () => {
                expect(planError).toEqual(new Error(REHYDRATE_MESSAGE));
            });

            it("should never reach the child", () => {
                expect(link.rehydrate).not.toHaveBeenCalled();
                expect(link.dehydrate).not.toHaveBeenCalled();
                expect(link.planSnapshotWrites).not.toHaveBeenCalled();
            });
        });
    });
});
