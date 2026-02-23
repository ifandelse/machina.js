/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { Emitter, Subscription } from "./emitter";

type TestEvents = {
    transitioning: { fromState: string; toState: string };
    transitioned: { fromState: string; toState: string };
    handling: { inputName: string };
};

const TRANSITION_PAYLOAD = { fromState: "green", toState: "yellow" };
const HANDLING_PAYLOAD = { inputName: "pedestrianWaiting" };

describe("Emitter", () => {
    let emitter: Emitter<TestEvents>;

    beforeEach(() => {
        jest.clearAllMocks();
        emitter = new Emitter<TestEvents>();
    });

    describe("on", () => {
        describe("when subscribing to an event for the first time", () => {
            let subscription: Subscription, cb: jest.Mock;

            beforeEach(() => {
                cb = jest.fn();
                subscription = emitter.on("transitioning", cb);
            });

            it("should return a subscription with an off method", () => {
                expect(subscription).toEqual(
                    expect.objectContaining({ off: expect.any(Function) })
                );
            });

            describe("when the event is subsequently emitted", () => {
                beforeEach(() => {
                    emitter.emit("transitioning", TRANSITION_PAYLOAD);
                });

                it("should call the listener with the payload", () => {
                    expect(cb).toHaveBeenCalledTimes(1);
                    expect(cb).toHaveBeenCalledWith(TRANSITION_PAYLOAD);
                });
            });
        });

        describe("when subscribing multiple listeners to the same event", () => {
            let cb1: jest.Mock, cb2: jest.Mock;

            beforeEach(() => {
                cb1 = jest.fn();
                cb2 = jest.fn();
                emitter.on("transitioned", cb1);
                emitter.on("transitioned", cb2);
                emitter.emit("transitioned", TRANSITION_PAYLOAD);
            });

            it("should call both listeners", () => {
                expect(cb1).toHaveBeenCalledTimes(1);
                expect(cb2).toHaveBeenCalledTimes(1);
            });
        });

        describe("when calling off() on the subscription", () => {
            let cb: jest.Mock;

            beforeEach(() => {
                cb = jest.fn();
                const subscription = emitter.on("transitioning", cb);
                subscription.off();
                emitter.emit("transitioning", TRANSITION_PAYLOAD);
            });

            it("should not call the unsubscribed listener", () => {
                expect(cb).not.toHaveBeenCalled();
            });
        });

        describe("when calling off() multiple times", () => {
            let secondOff: () => void;

            beforeEach(() => {
                const subscription = emitter.on("transitioning", jest.fn());
                subscription.off();
                secondOff = () => subscription.off();
            });

            it("should not throw", () => {
                expect(secondOff).not.toThrow();
            });
        });
    });

    describe("emit", () => {
        describe("when no listeners are registered", () => {
            let emitCall: () => void;

            beforeEach(() => {
                emitCall = () => emitter.emit("transitioning", TRANSITION_PAYLOAD);
            });

            it("should not throw", () => {
                expect(emitCall).not.toThrow();
            });
        });

        describe("when only wildcard listeners are registered", () => {
            let wildcardCb: jest.Mock;

            beforeEach(() => {
                wildcardCb = jest.fn();
                emitter.on("*", wildcardCb);
                emitter.emit("transitioning", TRANSITION_PAYLOAD);
            });

            it("should call the wildcard listener with event name and data", () => {
                expect(wildcardCb).toHaveBeenCalledTimes(1);
                expect(wildcardCb).toHaveBeenCalledWith("transitioning", TRANSITION_PAYLOAD);
            });
        });

        describe("when only named listeners are registered", () => {
            let namedCb: jest.Mock;

            beforeEach(() => {
                namedCb = jest.fn();
                emitter.on("handling", namedCb);
                emitter.emit("handling", HANDLING_PAYLOAD);
            });

            it("should call the named listener with the payload", () => {
                expect(namedCb).toHaveBeenCalledTimes(1);
                expect(namedCb).toHaveBeenCalledWith(HANDLING_PAYLOAD);
            });
        });

        describe("when both wildcard and named listeners are registered", () => {
            let order: string[], wildcardCb: jest.Mock, namedCb: jest.Mock;

            beforeEach(() => {
                order = [];
                wildcardCb = jest.fn().mockImplementation(() => order.push("wildcard"));
                namedCb = jest.fn().mockImplementation(() => order.push("named"));
                emitter.on("*", wildcardCb);
                emitter.on("transitioning", namedCb);
                emitter.emit("transitioning", TRANSITION_PAYLOAD);
            });

            it("should call wildcard listeners before named listeners", () => {
                expect(order).toEqual(["wildcard", "named"]);
            });

            it("should pass event name and data to wildcard", () => {
                expect(wildcardCb).toHaveBeenCalledWith("transitioning", TRANSITION_PAYLOAD);
            });

            it("should pass only data to named listener", () => {
                expect(namedCb).toHaveBeenCalledWith(TRANSITION_PAYLOAD);
            });
        });
    });

    describe("clear", () => {
        describe("when listeners are registered", () => {
            let namedCb: jest.Mock, wildcardCb: jest.Mock;

            beforeEach(() => {
                namedCb = jest.fn();
                wildcardCb = jest.fn();
                emitter.on("transitioning", namedCb);
                emitter.on("*", wildcardCb);
                emitter.clear();
                emitter.emit("transitioning", TRANSITION_PAYLOAD);
            });

            it("should not call named listeners on subsequent emit", () => {
                expect(namedCb).not.toHaveBeenCalled();
            });

            it("should not call wildcard listeners on subsequent emit", () => {
                expect(wildcardCb).not.toHaveBeenCalled();
            });
        });
    });
});
