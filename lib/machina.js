/**
 * machina - A library for creating powerful and flexible finite state machines. Loosely inspired by Erlang/OTP's gen_fsm behavior.
 * Author: Jim Cowart (http://ifandelse.com)
 * Version: v0.5.0-1
 * Url: http://machina-js.org/
 * License(s): MIT, GPL
 */

(function (root, factory) { /* istanbul ignore if  */
    if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define(["lodash"], function (_) {
            return factory(_, root);
        }); /* istanbul ignore else  */
    } else if (typeof module === "object" && module.exports) {
        // Node, or CommonJS-Like environments
        module.exports = factory(require("lodash"));
    } else {
        // Browser globals
        root.machina = factory(root._, root);
    }
}(this, function (_, global, undefined) {
    var slice = [].slice;
    var NEXT_TRANSITION = "transition";
    var HANDLING = "handling";
    var HANDLED = "handled";
    var NO_HANDLER = "nohandler";
    var TRANSITION = "transition";
    var INVALID_STATE = "invalidstate";
    var DEFERRED = "deferred";
    var NEW_FSM = "newfsm";

    function getDefaultBehavioralOptions() {
        return {
            initialState: "uninitialized",
            eventListeners: {
                "*": []
            },
            states: {},
            namespace: utils.makeFsmNamespace(),
            useSafeEmit: false
        };
    }

    function getDefaultClientMeta() {
        return {
            inputQueue: [],
            targetReplayState: "",
            state: undefined,
            priorState: undefined,
            priorAction: "",
            currentAction: "",
            currentActionArgs: undefined,
            inExitHandler: false
        };
    }

    function getLeaklessArgs(args, startIdx) {
        var result = [];
        for (var i = 0; i < args.length; i++) {
            result[i] = args[i];
        }
        return result.slice(startIdx || 0);
    }

    // _machKeys are members we want to track across the prototype chain of an extended FSM constructor
    // Since we want to eventually merge the aggregate of those values onto the instance so that FSMs
    // that share the same extended prototype won't share state *on* those prototypes.
    var _machKeys = ["states", "initialState"];
    var extend = function (protoProps, staticProps) {
        var parent = this;
        var fsm; // placeholder for instance constructor
        var machObj = {}; // object used to hold initialState & states from prototype for instance-level merging
        var ctor = function () {}; // placeholder ctor function used to insert level in prototype chain
        // The constructor function for the new subclass is either defined by you
        // (the "constructor" property in your `extend` definition), or defaulted
        // by us to simply call the parent's constructor.
        if (protoProps && protoProps.hasOwnProperty('constructor')) {
            fsm = protoProps.constructor;
        } else {
            // The default machina constructor (when using inheritance) creates a
            // deep copy of the states/initialState values from the prototype and
            // extends them over the instance so that they'll be instance-level.
            // If an options arg (args[0]) is passed in, a states or intialState
            // value will be preferred over any data pulled up from the prototype.
            fsm = function () {
                var args = slice.call(arguments, 0);
                args[0] = args[0] || {};
                var blendedState;
                var instanceStates = args[0].states || {};
                blendedState = _.merge(_.cloneDeep(machObj), {
                    states: instanceStates
                });
                blendedState.initialState = args[0].initialState || this.initialState;
                _.extend(args[0], blendedState);
                parent.apply(this, args);
            };
        }

        // Inherit class (static) properties from parent.
        _.merge(fsm, parent);

        // Set the prototype chain to inherit from `parent`, without calling
        // `parent`'s constructor function.
        ctor.prototype = parent.prototype;
        fsm.prototype = new ctor();

        // Add prototype properties (instance properties) to the subclass,
        // if supplied.
        if (protoProps) {
            _.extend(fsm.prototype, protoProps);
            _.merge(machObj, _.transform(protoProps, function (accum, val, key) {
                if (_machKeys.indexOf(key) !== -1) {
                    accum[key] = val;
                }
            }));
        }

        // Add static properties to the constructor function, if supplied.
        if (staticProps) {
            _.merge(fsm, staticProps);
        }

        // Correctly set child's `prototype.constructor`.
        fsm.prototype.constructor = fsm;

        // Set a convenience property in case the parent's prototype is needed later.
        fsm.__super__ = parent.prototype;
        return fsm;
    };

    var utils = {
        makeFsmNamespace: (function () {
            var machinaCount = 0;
            return function () {
                return "fsm." + machinaCount++;
            };
        })(),
        getDefaultOptions: getDefaultBehavioralOptions,
        getDefaultClientMeta: getDefaultClientMeta
    };

    var emitter = {

        emit: function (eventName) {
            var args = getLeaklessArgs(arguments);
            if (this.eventListeners["*"]) {
                _.each(this.eventListeners["*"], function (callback) {
                    if (!this.useSafeEmit) {
                        callback.apply(this, args);
                    } else {
                        try {
                            callback.apply(this, args);
                        } catch (exception) { /* istanbul ignore else  */
                            if (console && typeof console.log !== "undefined") {
                                console.log(exception.stack);
                            }
                        }
                    }
                }, this);
            }
            if (this.eventListeners[eventName]) {
                _.each(this.eventListeners[eventName], function (callback) {
                    if (!this.useSafeEmit) {
                        callback.apply(this, args.slice(1));
                    } else {
                        try {
                            callback.apply(this, args.slice(1));
                        } catch (exception) { /* istanbul ignore else  */
                            if (console && typeof console.log !== "undefined") {
                                console.log(exception.stack);
                            }
                        }
                    }
                }, this);
            }
        },

        on: function (eventName, callback) {
            var self = this;
            self.eventListeners = self.eventListeners || {
                "*": []
            };
            if (!self.eventListeners[eventName]) {
                self.eventListeners[eventName] = [];
            }
            self.eventListeners[eventName].push(callback);
            return {
                eventName: eventName,
                callback: callback,
                off: function () {
                    self.off(eventName, callback);
                }
            };
        },

        off: function (eventName, callback) {
            this.eventListeners = this.eventListeners || {
                "*": []
            };
            if (!eventName) {
                this.eventListeners = {};
            } else {
                if (callback) {
                    this.eventListeners[eventName] = _.without(this.eventListeners[eventName], callback);
                } else {
                    this.eventListeners[eventName] = [];
                }
            }
        },
    };

    var MACHINA_PROP = "__machina__";

    function BehavioralFsm(options) {
        _.extend(this, options);
        _.defaults(this, getDefaultBehavioralOptions());
        this.initialize.apply(this, arguments);
        machina.emit(NEW_FSM, this);
    }

    _.extend(BehavioralFsm.prototype, {
        initialize: function () {},

        initClient: function initClient(client) {
            var initialState = this.initialState;
            if (!initialState) {
                throw new Error("You must specify an initial state for this FSM");
            }
            if (!this.states[initialState]) {
                throw new Error("The initial state specified does not exist in the states object.");
            }
            this.transition(client, initialState);
        },

        ensureClientMeta: function ensureClientMeta(client) {
            if (typeof client !== "object") {
                throw new Error("A BehavioralFsm client must be an object, not a primitive.");
            }
            if (!client[MACHINA_PROP]) {
                client[MACHINA_PROP] = _.cloneDeep(getDefaultClientMeta());
                this.initClient(client);
            }
            return client[MACHINA_PROP];
        },

        buildEventPayload: function (client, data) {
            if (_.isPlainObject(data)) {
                return _.extend(data, {
                    client: client
                });
            } else {
                return {
                    client: client,
                    data: data || null
                };
            }
        },

        getHandlerArgs: function (args, isCatchAll) {
            return isCatchAll ? args : [args[0]].concat(args.slice(2));
        },

        handle: function (client, inputType) {
            var clientMeta = this.ensureClientMeta(client);
            var args = getLeaklessArgs(arguments);
            var currentState = clientMeta.state;
            clientMeta.currentActionArgs = args.slice(1);
            var handlerName;
            var handler;
            var isCatchAll = false;
            var result;
            if (!clientMeta.inExitHandler) {
                handlerName = this.states[currentState][inputType] ? inputType : "*";
                isCatchAll = (handlerName === "*");
                handler = (this.states[currentState][handlerName] || this[handlerName]) || this["*"];
                action = clientMeta.state + "." + handlerName;
                clientMeta.currentAction = action;
                var eventPayload = this.buildEventPayload(client, {
                    inputType: inputType
                });
                if (!handler) {
                    this.emit(NO_HANDLER, eventPayload);
                } else {
                    this.emit(HANDLING, eventPayload);
                    if (typeof handler === "function") {
                        result = handler.apply(this, this.getHandlerArgs(args, isCatchAll));
                    } else {
                        result = handler;
                        this.transition(client, handler);
                    }
                    this.emit(HANDLED, eventPayload);
                }
                clientMeta.priorAction = clientMeta.currentAction;
                clientMeta.currentAction = "";
            }
            return result;
        },

        transition: function (client, newState) {
            var clientMeta = this.ensureClientMeta(client);
            var curState = clientMeta.state;
            if (!clientMeta.inExitHandler && newState !== curState) {
                if (this.states[newState]) {
                    if (curState && this.states[curState] && this.states[curState]._onExit) {
                        clientMeta.inExitHandler = true;
                        this.states[curState]._onExit.call(this, client);
                        clientMeta.inExitHandler = false;
                    }
                    clientMeta.targetReplayState = newState;
                    clientMeta.priorState = curState;
                    clientMeta.state = newState;
                    var eventPayload = this.buildEventPayload(client, {
                        fromState: clientMeta.priorState,
                        action: clientMeta.currentAction,
                        toState: newState
                    });
                    this.emit(TRANSITION, eventPayload);
                    if (this.states[newState]._onEnter) {
                        this.states[newState]._onEnter.call(this, client);
                    }
                    if (clientMeta.targetReplayState === newState) {
                        this.processQueue(client, NEXT_TRANSITION);
                    }
                    return;
                }
                this.emit.call(this, INVALID_STATE, {
                    state: clientMeta.state,
                    attemptedState: newState
                });
            }
        },

        deferUntilTransition: function (client, stateName) {
            var clientMeta = this.ensureClientMeta(client);
            if (clientMeta.currentActionArgs) {
                var queued = {
                    type: NEXT_TRANSITION,
                    untilState: stateName,
                    args: clientMeta.currentActionArgs
                };
                clientMeta.inputQueue.push(queued);
                var eventPayload = this.buildEventPayload(client, {
                    state: clientMeta.state,
                    queuedArgs: queued
                });
                this.emit(DEFERRED, eventPayload);
            }
        },

        processQueue: function (client) {
            var clientMeta = this.ensureClientMeta(client);
            var filterFn = function (item) {
                return ((!item.untilState) || (item.untilState === clientMeta.state));
            };
            var toProcess = _.filter(clientMeta.inputQueue, filterFn);
            clientMeta.inputQueue = _.difference(clientMeta.inputQueue, toProcess);
            _.each(toProcess, function (item) {
                this.handle.apply(this, [client].concat(item.args));
            }, this);
        },

        clearQueue: function (client, name) {
            var clientMeta = this.ensureClientMeta(client);
            if (!name) {
                clientMeta.inputQueue = [];
            } else {
                var filter = function (evnt) {
                    return (name ? evnt.untilState !== name : true);
                };
                clientMeta.inputQueue = _.filter(clientMeta.inputQueue, filter);
            }
        }
    }, emitter);

    BehavioralFsm.extend = extend;

    var Fsm = BehavioralFsm.extend({
        constructor: function () {
            BehavioralFsm.apply(this, arguments);
            this.ensureClientMeta();
        },
        initClient: function initClient() {
            var initialState = this.initialState;
            if (!initialState) {
                throw new Error("You must specify an initial state for this FSM");
            }
            if (!this.states[initialState]) {
                throw new Error("The initial state specified does not exist in the states object.");
            }
            this.transition(initialState);
        },
        ensureClientMeta: function ensureClientMeta() {
            if (!this._stamped) {
                this._stamped = true;
                _.defaults(this, _.cloneDeep(getDefaultClientMeta()));
                this.initClient();
            }
            return this;
        },
        getHandlerArgs: function (args, isCatchAll) {
            return isCatchAll ? args.slice(1) : args.slice(2);
        },
        // "classic" machina FSM can support event payloads of any type
        // not going to force these into a specific structure like I did
        // the BehavioralFsm event payloads
        buildEventPayload: function () {
            var client = this;
            var data = ((arguments[0] === this) ? arguments[1] : arguments[0]) || null;
            return data;
        },
        handle: function (inputType) {
            return BehavioralFsm.prototype.handle.apply(
            this, (arguments[0] === this) ? arguments : [this].concat(getLeaklessArgs(arguments)));
        },
        transition: function (newState) {
            return BehavioralFsm.prototype.transition.apply(
            this, (arguments[0] === this) ? arguments : [this].concat(newState));
        },
        deferUntilTransition: function (stateName) {
            return BehavioralFsm.prototype.deferUntilTransition.apply(
            this, (arguments[0] === this) ? arguments : [this].concat(stateName));
        },
        processQueue: function (type) {
            return BehavioralFsm.prototype.processQueue.apply(
            this, (arguments[0] === this) ? arguments : [this]);
        },
        clearQueue: function (name) {
            return BehavioralFsm.prototype.clearQueue.apply(
            this, (arguments[0] === this) ? arguments : [this].concat([name]));
        }
    });

    var machina = _.merge(emitter, {
        Fsm: Fsm,
        BehavioralFsm: BehavioralFsm,
        utils: utils,
        eventListeners: {
            newFsm: []
        }
    });

    return machina;
}));
