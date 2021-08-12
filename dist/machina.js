/*!
 * machina - A library for creating powerful and flexible finite state machines. Loosely inspired by Erlang/OTP's gen_fsm behavior.
 * Author: Jim Cowart (http://ifandelse.com)
 * Version: v4.0.2
 * Url: http://machina-js.org/
 * License(s): MIT
 */(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("lodash"));
	else if(typeof define === 'function' && define.amd)
		define(["lodash"], factory);
	else if(typeof exports === 'object')
		exports["machina"] = factory(require("lodash"));
	else
		root["machina"] = factory(root["_"]);
})(this, function(__WEBPACK_EXTERNAL_MODULE__760__) {
return /******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 319:
/***/ ((module) => {

module.exports = {
  NEXT_TRANSITION: "transition",
  HANDLING: "handling",
  HANDLED: "handled",
  NO_HANDLER: "nohandler",
  TRANSITION: "transition",
  TRANSITIONED: "transitioned",
  INVALID_STATE: "invalidstate",
  DEFERRED: "deferred",
  NEW_FSM: "newfsm"
};

/***/ }),

/***/ 622:
/***/ ((module, __unused_webpack___webpack_exports__, __webpack_require__) => {

"use strict";

// EXTERNAL MODULE: external {"root":"_","commonjs":"lodash","commonjs2":"lodash","amd":"lodash"}
var external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_ = __webpack_require__(760);
var external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default = /*#__PURE__*/__webpack_require__.n(external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_);
;// CONCATENATED MODULE: ./src/emitter.js

function getInstance() {
  return {
    emit: function emit() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      var eventName = args[0];

      if (this.eventListeners["*"]) {
        external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().each(this.eventListeners["*"], function (callback) {
          if (!this.useSafeEmit) {
            callback.apply(this, args);
          } else {
            try {
              callback.apply(this, args);
            } catch (exception) {
              /* istanbul ignore else  */
              if (console && typeof console.log !== "undefined") {
                // eslint-disable-line no-console
                console.log(exception.stack); // eslint-disable-line no-console
              }
            }
          }
        }.bind(this));
      }

      if (this.eventListeners[eventName]) {
        external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().each(this.eventListeners[eventName], function (callback) {
          if (!this.useSafeEmit) {
            callback.apply(this, args.slice(1));
          } else {
            try {
              callback.apply(this, args.slice(1));
            } catch (exception) {
              /* istanbul ignore else  */
              if (console && typeof console.log !== "undefined") {
                // eslint-disable-line no-console
                console.log(exception.stack); // eslint-disable-line no-console
              }
            }
          }
        }.bind(this));
      }
    },
    on: function on(eventName, callback) {
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
        off: function off() {
          self.off(eventName, callback);
        }
      };
    },
    off: function off(eventName, callback) {
      this.eventListeners = this.eventListeners || {
        "*": []
      };

      if (!eventName) {
        this.eventListeners = {};
      } else if (callback) {
        this.eventListeners[eventName] = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().without(this.eventListeners[eventName], callback);
      } else {
        this.eventListeners[eventName] = [];
      }
    }
  };
}

var _instance = getInstance();


// EXTERNAL MODULE: ./src/events.js
var events = __webpack_require__(319);
var events_default = /*#__PURE__*/__webpack_require__.n(events);
;// CONCATENATED MODULE: ./src/utils.js
function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }




var makeFsmNamespace = function () {
  var machinaCount = 0;
  return function () {
    return "fsm.".concat(machinaCount++);
  };
}();

function getDefaultBehavioralOptions() {
  return {
    initialState: "uninitialized",
    eventListeners: {
      "*": []
    },
    states: {},
    namespace: makeFsmNamespace(),
    useSafeEmit: false,
    hierarchy: {},
    pendingDelegations: {}
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
/*
	handle ->
		child = stateObj._child && stateObj._child.instance;

	transition ->
		newStateObj._child = getChildFsmInstance( newStateObj._child );
		child = newStateObj._child && newStateObj._child.instance;
*/


function getChildFsmInstance(config) {
  if (!config) {
    return;
  }

  var childFsmDefinition = {};

  if (_typeof(config) === "object") {
    // is this a config object with a factory?
    if (config.factory) {
      childFsmDefinition = config;
      childFsmDefinition.instance = childFsmDefinition.factory();
    } else {
      // assuming this is a machina instance
      childFsmDefinition.factory = function () {
        return config;
      };
    }
  } else if (typeof config === "function") {
    childFsmDefinition.factory = config;
  }

  childFsmDefinition.instance = childFsmDefinition.factory();
  return childFsmDefinition;
}

function listenToChild(fsm, child) {
  // Need to investigate potential for discarded event
  // listener memory leak in long-running, deeply-nested hierarchies.
  return child.on("*", function (eventName, data) {
    var ticket;

    switch (eventName) {
      case (events_default()).NO_HANDLER:
        if (!data.ticket && !data.delegated && data.namespace !== fsm.namespace) {
          // Ok - we're dealing w/ a child handling input that should bubble up
          data.args[1].bubbling = true;
        } // we do NOT bubble _reset inputs up to the parent


        if (data.inputType !== "_reset") {
          fsm.handle.apply(fsm, data.args); // eslint-disable-line prefer-spread
        }

        break;

      case (events_default()).HANDLING:
        ticket = data.ticket;

        if (ticket && fsm.pendingDelegations[ticket]) {
          delete fsm.pendingDelegations[ticket];
        }

        fsm.emit(eventName, data); // possibly transform payload?

        break;

      default:
        fsm.emit(eventName, data); // possibly transform payload?

        break;
    }
  });
} // _machKeys are members we want to track across the prototype chain of an extended FSM constructor
// Since we want to eventually merge the aggregate of those values onto the instance so that FSMs
// that share the same extended prototype won't share state *on* those prototypes.


var _machKeys = ["states", "initialState"];

var extend = function extend(protoProps, staticProps) {
  var parent = this; // eslint-disable-line no-invalid-this, consistent-this

  var fsm; // placeholder for instance constructor

  var machObj = {}; // object used to hold initialState & states from prototype for instance-level merging

  var Ctor = function Ctor() {}; // placeholder ctor function used to insert level in prototype chain
  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent's constructor.


  if (protoProps && protoProps.hasOwnProperty("constructor")) {
    fsm = protoProps.constructor;
  } else {
    // The default machina constructor (when using inheritance) creates a
    // deep copy of the states/initialState values from the prototype and
    // extends them over the instance so that they'll be instance-level.
    // If an options arg (args[0]) is passed in, a states or intialState
    // value will be preferred over any data pulled up from the prototype.
    fsm = function fsm() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      args[0] = args[0] || {};
      var instanceStates = args[0].states || {};

      var blendedState = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().merge(external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().cloneDeep(machObj), {
        states: instanceStates
      });

      blendedState.initialState = args[0].initialState || this.initialState; // eslint-disable-line no-invalid-this

      external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend(args[0], blendedState);

      parent.apply(this, args); // eslint-disable-line no-invalid-this
    };
  } // Inherit class (static) properties from parent.


  external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().merge(fsm, parent); // Set the prototype chain to inherit from `parent`, without calling
  // `parent`'s constructor function.


  Ctor.prototype = parent.prototype;
  fsm.prototype = new Ctor(); // Add prototype properties (instance properties) to the subclass,
  // if supplied.

  if (protoProps) {
    external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend(fsm.prototype, protoProps);

    external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().merge(machObj, external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().transform(protoProps, function (accum, val, key) {
      if (_machKeys.indexOf(key) !== -1) {
        accum[key] = val;
      }
    }));
  } // Add static properties to the constructor function, if supplied.


  if (staticProps) {
    external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().merge(fsm, staticProps);
  } // Correctly set child's `prototype.constructor`.


  fsm.prototype.constructor = fsm; // Set a convenience property in case the parent's prototype is needed later.

  fsm.__super__ = parent.prototype;
  return fsm;
};
/* eslint-disable no-magic-numbers */


function createUUID() {
  var s = [];
  var hexDigits = "0123456789abcdef";

  for (var i = 0; i < 36; i++) {
    s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
  }

  s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010

  s[19] = hexDigits.substr(s[19] & 0x3 | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01

  s[8] = s[13] = s[18] = s[23] = "-";
  return s.join("");
}
/* eslint-enable no-magic-numbers */


var utils = {
  createUUID: createUUID,
  extend: extend,
  getDefaultBehavioralOptions: getDefaultBehavioralOptions,
  getDefaultOptions: getDefaultBehavioralOptions,
  getDefaultClientMeta: getDefaultClientMeta,
  getChildFsmInstance: getChildFsmInstance,
  listenToChild: listenToChild,
  makeFsmNamespace: makeFsmNamespace
};

;// CONCATENATED MODULE: ./src/BehavioralFsm.js
function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _iterableToArray(iter) { if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) return _arrayLikeToArray(arr); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function BehavioralFsm_typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { BehavioralFsm_typeof = function _typeof(obj) { return typeof obj; }; } else { BehavioralFsm_typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return BehavioralFsm_typeof(obj); }





var topLevelEmitter = _instance;
var MACHINA_PROP = "__machina__";

function BehavioralFsm() {
  for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }

  var options = args[0];

  external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend(this, options);

  external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().defaults(this, utils.getDefaultBehavioralOptions());

  this.initialize.apply(this, args);
  topLevelEmitter.emit((events_default()).NEW_FSM, this);
}

external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend(BehavioralFsm.prototype, {
  initialize: function initialize() {},
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
  configForState: function configForState(newState) {
    var newStateObj = this.states[newState];
    var child;

    external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().each(this.hierarchy, function (childListener
    /* key */
    ) {
      if (childListener && typeof childListener.off === "function") {
        childListener.off();
      }
    });

    if (newStateObj._child) {
      newStateObj._child = utils.getChildFsmInstance(newStateObj._child);
      child = newStateObj._child && newStateObj._child.instance;
      this.hierarchy[child.namespace] = utils.listenToChild(this, child);
    }

    return child;
  },
  ensureClientMeta: function ensureClientMeta(client) {
    if (BehavioralFsm_typeof(client) !== "object") {
      throw new Error("An FSM client must be an object.");
    }

    client[MACHINA_PROP] = client[MACHINA_PROP] || {};

    if (!client[MACHINA_PROP][this.namespace]) {
      client[MACHINA_PROP][this.namespace] = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().cloneDeep(utils.getDefaultClientMeta());
      this.initClient(client);
    }

    return client[MACHINA_PROP][this.namespace];
  },
  buildEventPayload: function buildEventPayload(client, data) {
    if (external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().isPlainObject(data)) {
      return external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend(data, {
        client: client,
        namespace: this.namespace
      });
    }

    return {
      client: client,
      data: data || null,
      namespace: this.namespace
    };
  },
  getHandlerArgs: function getHandlerArgs(args, isCatchAll) {
    // index 0 is the client, index 1 is inputType
    // if we're in a catch-all handler, input type needs to be included in the args
    // inputType might be an object, so we need to just get the inputType string if so
    var _args = args.slice(0);

    var input = _args[1];

    if (BehavioralFsm_typeof(input) === "object") {
      _args.splice(1, 1, input.inputType);
    }

    return isCatchAll ? _args : [_args[0]].concat(_args.slice(2));
  },
  getSystemHandlerArgs: function getSystemHandlerArgs(args, client) {
    return [client].concat(args);
  },
  // eslint-disable-next-line max-statements
  handle: function handle() {
    for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      args[_key2] = arguments[_key2];
    }

    var client = args[0],
        input = args[1];
    var inputDef = input;

    if (typeof input === "undefined") {
      throw new Error("The input argument passed to the FSM's handle method is undefined. Did you forget to pass the input name?");
    }

    if (typeof input === "string") {
      inputDef = {
        inputType: input,
        delegated: false,
        ticket: undefined
      };
    }

    var clientMeta = this.ensureClientMeta(client);

    if (BehavioralFsm_typeof(input) !== "object") {
      args.splice(1, 1, inputDef);
    }

    clientMeta.currentActionArgs = args.slice(1);
    var currentState = clientMeta.state;
    var stateObj = this.states[currentState];
    var handlerName, handler, child, result, action;
    var isCatchAll = false;

    if (!clientMeta.inExitHandler) {
      child = this.configForState(currentState);

      if (child && !this.pendingDelegations[inputDef.ticket] && !inputDef.bubbling) {
        var _child;

        inputDef.ticket = inputDef.ticket || utils.createUUID();
        inputDef.delegated = true;
        this.pendingDelegations[inputDef.ticket] = {
          delegatedTo: child.namespace
        }; // WARNING - returning a value from `handle` on child FSMs is not really supported.
        // If you need to return values from child FSM input handlers, use events instead.

        result = (_child = child).handle.apply(_child, args);
      } else {
        if (inputDef.ticket && this.pendingDelegations[inputDef.ticket]) {
          delete this.pendingDelegations[inputDef.ticket];
        }

        handlerName = stateObj[inputDef.inputType] ? inputDef.inputType : "*";
        isCatchAll = handlerName === "*";
        handler = stateObj[handlerName] || this[handlerName] || this["*"];
        action = "".concat(clientMeta.state, ".").concat(handlerName);
        clientMeta.currentAction = action;
        var eventPayload = this.buildEventPayload(client, {
          inputType: inputDef.inputType,
          delegated: inputDef.delegated,
          ticket: inputDef.ticket
        });

        if (!handler) {
          this.emit((events_default()).NO_HANDLER, external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend({
            args: args
          }, eventPayload));
        } else {
          this.emit((events_default()).HANDLING, eventPayload);

          if (typeof handler === "function") {
            result = handler.apply(this, this.getHandlerArgs(args, isCatchAll));
          } else {
            result = handler;
            this.transition(client, handler);
          }

          this.emit((events_default()).HANDLED, eventPayload);
        }

        clientMeta.priorAction = clientMeta.currentAction;
        clientMeta.currentAction = "";
        clientMeta.currentActionArgs = undefined;
      }
    }

    return result;
  },
  // eslint-disable-next-line max-statements
  transition: function transition(client, newState) {
    var clientMeta = this.ensureClientMeta(client);
    var curState = clientMeta.state;
    var curStateObj = this.states[curState];
    var newStateObj = this.states[newState];
    var child;

    if (!clientMeta.inExitHandler && newState !== curState) {
      if (newStateObj) {
        child = this.configForState(newState);

        if (curStateObj && curStateObj._onExit) {
          clientMeta.inExitHandler = true;

          curStateObj._onExit.call(this, client);

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
        this.emit((events_default()).TRANSITION, eventPayload);

        if (newStateObj._onEnter) {
          for (var _len3 = arguments.length, args = new Array(_len3 > 2 ? _len3 - 2 : 0), _key3 = 2; _key3 < _len3; _key3++) {
            args[_key3 - 2] = arguments[_key3];
          }

          newStateObj._onEnter.apply(this, this.getSystemHandlerArgs(args, client));
        }

        this.emit((events_default()).TRANSITIONED, eventPayload);

        if (child) {
          child.handle(client, "_reset");
        }

        if (clientMeta.targetReplayState === newState) {
          this.processQueue(client, (events_default()).NEXT_TRANSITION);
        }

        return;
      }

      this.emit((events_default()).INVALID_STATE, this.buildEventPayload(client, {
        state: clientMeta.state,
        attemptedState: newState
      }));
    }
  },
  deferUntilTransition: function deferUntilTransition(client, stateName) {
    var clientMeta = this.ensureClientMeta(client);
    var stateList = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().isArray(stateName) ? stateName : stateName ? [stateName] : undefined; // eslint-disable-line no-nested-ternary

    if (clientMeta.currentActionArgs) {
      var queued = {
        type: (events_default()).NEXT_TRANSITION,
        untilState: stateList,
        args: clientMeta.currentActionArgs
      };
      clientMeta.inputQueue.push(queued);
      var eventPayload = this.buildEventPayload(client, {
        state: clientMeta.state,
        queuedArgs: queued
      });
      this.emit((events_default()).DEFERRED, eventPayload);
    }
  },
  deferAndTransition: function deferAndTransition(client, stateName) {
    this.deferUntilTransition(client, stateName);
    this.transition(client, stateName);
  },
  processQueue: function processQueue(client) {
    var clientMeta = this.ensureClientMeta(client);

    var filterFn = function filterFn(item) {
      return !item.untilState || external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().includes(item.untilState, clientMeta.state);
    };

    var toProcess = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().filter(clientMeta.inputQueue, filterFn);

    clientMeta.inputQueue = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().difference(clientMeta.inputQueue, toProcess);

    external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().each(toProcess, function (item) {
      this.handle.apply(this, _toConsumableArray([client].concat(item.args)));
    }.bind(this));
  },
  clearQueue: function clearQueue(client, name) {
    var clientMeta = this.ensureClientMeta(client);

    if (!name) {
      clientMeta.inputQueue = [];
    } else {
      // first pass we remove the target state from any `untilState` array
      external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().each(clientMeta.inputQueue, function (item) {
        item.untilState = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().without(item.untilState, name);
      }); // second pass we clear out deferred events with empty untilState arrays


      var filter = function filter(evnt) {
        return evnt.untilState.length !== 0;
      };

      clientMeta.inputQueue = external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().filter(clientMeta.inputQueue, filter);
    }
  },
  compositeState: function compositeState(client) {
    var clientMeta = this.ensureClientMeta(client);
    var state = clientMeta.state;
    var child = this.states[state]._child && this.states[state]._child.instance;

    if (child) {
      state += ".".concat(child.compositeState(client));
    }

    return state;
  }
}, getInstance());

BehavioralFsm.extend = utils.extend;

;// CONCATENATED MODULE: ./src/Fsm.js
function Fsm_typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { Fsm_typeof = function _typeof(obj) { return typeof obj; }; } else { Fsm_typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return Fsm_typeof(obj); }




var Fsm = {
  constructor: function constructor() {
    BehavioralFsm.apply(this, arguments); // eslint-disable-line prefer-rest-params

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

      external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().defaults(this, external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().cloneDeep(utils.getDefaultClientMeta()));

      this.initClient();
    }

    return this;
  },
  ensureClientArg: function ensureClientArg(args) {
    var _args = args; // we need to test the args and verify that if a client arg has
    // been passed, it must be this FSM instance (this isn't a behavioral FSM)

    if (Fsm_typeof(_args[0]) === "object" && !("inputType" in _args[0]) && _args[0] !== this) {
      _args.splice(0, 1, this);
    } else if (Fsm_typeof(_args[0]) !== "object" || Fsm_typeof(_args[0]) === "object" && "inputType" in _args[0]) {
      _args.unshift(this);
    }

    return _args;
  },
  getHandlerArgs: function getHandlerArgs(args, isCatchAll) {
    // index 0 is the client, index 1 is inputType
    // if we're in a catch-all handler, input type needs to be included in the args
    // inputType might be an object, so we need to just get the inputType string if so
    var _args = args;
    var input = _args[1];

    if ((typeof inputType === "undefined" ? "undefined" : Fsm_typeof(inputType)) === "object") {
      _args.splice(1, 1, input.inputType);
    }

    return isCatchAll ? _args.slice(1) : _args.slice(2);
  },
  getSystemHandlerArgs: function getSystemHandlerArgs(args
  /* client */
  ) {
    return args;
  },
  // "classic" machina FSM do not emit the client property on events (which would be the FSM itself)
  buildEventPayload: function buildEventPayload() {
    for (var _len = arguments.length, _args = new Array(_len), _key = 0; _key < _len; _key++) {
      _args[_key] = arguments[_key];
    }

    var args = this.ensureClientArg(_args);
    var data = args[1];

    if (external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().isPlainObject(data)) {
      return external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().extend(data, {
        namespace: this.namespace
      });
    }

    return {
      data: data || null,
      namespace: this.namespace
    };
  }
};

external_root_commonjs_lodash_commonjs2_lodash_amd_lodash_default().each(["handle", "transition", "deferUntilTransition", "processQueue", "clearQueue"], function (methodWithClientInjected) {
  Fsm[methodWithClientInjected] = function () {
    for (var _len2 = arguments.length, _args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      _args[_key2] = arguments[_key2];
    }

    var args = this.ensureClientArg(_args);
    return BehavioralFsm.prototype[methodWithClientInjected].apply(this, args);
  };
});

Fsm = BehavioralFsm.extend(Fsm);

;// CONCATENATED MODULE: ./src/index.js
/* module decorator */ module = __webpack_require__.hmd(module);
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }





module.exports = _objectSpread(_objectSpread({}, _instance), {}, {
  Fsm: Fsm,
  BehavioralFsm: BehavioralFsm,
  utils: utils,
  eventListeners: {
    newFsm: []
  }
});

/***/ }),

/***/ 760:
/***/ ((module) => {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__760__;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/harmony module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.hmd = (module) => {
/******/ 			module = Object.create(module);
/******/ 			if (!module.children) module.children = [];
/******/ 			Object.defineProperty(module, 'exports', {
/******/ 				enumerable: true,
/******/ 				set: () => {
/******/ 					throw new Error('ES Modules may not assign module.exports or exports.*, Use ESM export syntax, instead: ' + module.id);
/******/ 				}
/******/ 			});
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(622);
/******/ 	__webpack_exports__ = __webpack_exports__.default;
/******/ 	
/******/ 	return __webpack_exports__;
/******/ })()
;
});