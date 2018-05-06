/*!
 *  * machina - A library for creating powerful and flexible finite state machines. Loosely inspired by Erlang/OTP's gen_fsm behavior.
 *  * Author: Jim Cowart (http://ifandelse.com)
 *  * Version: v2.0.2
 *  * Url: http://machina-js.org/
 *  * License(s): 
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("lodash"));
	else if(typeof define === 'function' && define.amd)
		define(["lodash"], factory);
	else if(typeof exports === 'object')
		exports["machina"] = factory(require("lodash"));
	else
		root["machina"] = factory(root["_"]);
})(this, function(__WEBPACK_EXTERNAL_MODULE_1__) {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

	var _ = __webpack_require__( 1 );
	var emitter = __webpack_require__( 2 );
	
	module.exports = _.merge( emitter.instance, {
		Fsm: __webpack_require__( 5 ),
		BehavioralFsm: __webpack_require__( 6 ),
		utils: __webpack_require__( 3 ),
		eventListeners: {
			newFsm: []
		}
	} );


/***/ }),
/* 1 */
/***/ (function(module, exports) {

	module.exports = __WEBPACK_EXTERNAL_MODULE_1__;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

	var utils = __webpack_require__( 3 );
	var _ = __webpack_require__( 1 );
	
	function getInstance() {
		return {
			emit: function( eventName ) {
				var args = utils.getLeaklessArgs( arguments );
				if ( this.eventListeners[ "*" ] ) {
					_.each( this.eventListeners[ "*" ], function( callback ) {
						if ( !this.useSafeEmit ) {
							callback.apply( this, args );
						} else {
							try {
								callback.apply( this, args );
							} catch ( exception ) {
								/* istanbul ignore else  */
								if ( console && typeof console.log !== "undefined" ) {
									console.log( exception.stack );
								}
							}
						}
					}, this );
				}
				if ( this.eventListeners[ eventName ] ) {
					_.each( this.eventListeners[ eventName ], function( callback ) {
						if ( !this.useSafeEmit ) {
							callback.apply( this, args.slice( 1 ) );
						} else {
							try {
								callback.apply( this, args.slice( 1 ) );
							} catch ( exception ) {
								/* istanbul ignore else  */
								if ( console && typeof console.log !== "undefined" ) {
									console.log( exception.stack );
								}
							}
						}
					}, this );
				}
			},
	
			on: function( eventName, callback ) {
				var self = this;
				self.eventListeners = self.eventListeners || { "*": [] };
				if ( !self.eventListeners[ eventName ] ) {
					self.eventListeners[ eventName ] = [];
				}
				self.eventListeners[ eventName ].push( callback );
				return {
					eventName: eventName,
					callback: callback,
					off: function() {
						self.off( eventName, callback );
					}
				};
			},
	
			off: function( eventName, callback ) {
				this.eventListeners = this.eventListeners || { "*": [] };
				if ( !eventName ) {
					this.eventListeners = {};
				} else {
					if ( callback ) {
						this.eventListeners[ eventName ] = _.without( this.eventListeners[ eventName ], callback );
					} else {
						this.eventListeners[ eventName ] = [];
					}
				}
			}
		};
	}
	
	module.exports = {
		getInstance: getInstance,
		instance: getInstance()
	};


/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

	var slice = [].slice;
	var events = __webpack_require__( 4 );
	var _ = __webpack_require__( 1 );
	
	var makeFsmNamespace = ( function() {
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		};
	} )();
	
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
	
	function getLeaklessArgs( args, startIdx ) {
		var result = [];
		for ( var i = ( startIdx || 0 ); i < args.length; i++ ) {
			result[ i ] = args[ i ];
		}
		return result;
	}
	/*
		handle ->
			child = stateObj._child && stateObj._child.instance;
	
		transition ->
			newStateObj._child = getChildFsmInstance( newStateObj._child );
			child = newStateObj._child && newStateObj._child.instance;
	*/
	function getChildFsmInstance( config ) {
		if ( !config ) {
			return;
		}
		var childFsmDefinition = {};
		if ( typeof config === "object" ) {
			// is this a config object with a factory?
			if ( config.factory ) {
				childFsmDefinition = config;
			} else {
				// assuming this is a machina instance
				childFsmDefinition.factory = function() {
					return config;
				};
			}
		} else if ( typeof config === "function" ) {
			childFsmDefinition.factory = config;
		}
		childFsmDefinition.instance = childFsmDefinition.factory();
		return childFsmDefinition;
	}
	
	function listenToChild( fsm, child ) {
		// Need to investigate potential for discarded event
		// listener memory leak in long-running, deeply-nested hierarchies.
		return child.on( "*", function( eventName, data ) {
			switch ( eventName ) {
				case events.NO_HANDLER:
					if ( !data.ticket && !data.delegated && data.namespace !== fsm.namespace ) {
						// Ok - we're dealing w/ a child handling input that should bubble up
						data.args[ 1 ].bubbling = true;
					}
					// we do NOT bubble _reset inputs up to the parent
					if ( data.inputType !== "_reset" ) {
						fsm.handle.apply( fsm, data.args );
					}
					break;
				case events.HANDLING :
					var ticket = data.ticket;
					if ( ticket && fsm.pendingDelegations[ ticket ] ) {
						delete fsm.pendingDelegations[ ticket ];
					}
					fsm.emit( eventName, data ); // possibly transform payload?
					break;
				default:
					fsm.emit( eventName, data ); // possibly transform payload?
					break;
			}
		} );
	}
	
	// _machKeys are members we want to track across the prototype chain of an extended FSM constructor
	// Since we want to eventually merge the aggregate of those values onto the instance so that FSMs
	// that share the same extended prototype won't share state *on* those prototypes.
	var _machKeys = [ "states", "initialState" ];
	var extend = function( protoProps, staticProps ) {
		var parent = this;
		var fsm; // placeholder for instance constructor
		var machObj = {}; // object used to hold initialState & states from prototype for instance-level merging
		var Ctor = function() {}; // placeholder ctor function used to insert level in prototype chain
	
		// The constructor function for the new subclass is either defined by you
		// (the "constructor" property in your `extend` definition), or defaulted
		// by us to simply call the parent's constructor.
		if ( protoProps && protoProps.hasOwnProperty( "constructor" ) ) {
			fsm = protoProps.constructor;
		} else {
			// The default machina constructor (when using inheritance) creates a
			// deep copy of the states/initialState values from the prototype and
			// extends them over the instance so that they'll be instance-level.
			// If an options arg (args[0]) is passed in, a states or intialState
			// value will be preferred over any data pulled up from the prototype.
			fsm = function() {
				var args = slice.call( arguments, 0 );
				args[ 0 ] = args[ 0 ] || {};
				var blendedState;
				var instanceStates = args[ 0 ].states || {};
				blendedState = _.merge( _.cloneDeep( machObj ), { states: instanceStates } );
				blendedState.initialState = args[ 0 ].initialState || this.initialState;
				_.extend( args[ 0 ], blendedState );
				parent.apply( this, args );
			};
		}
	
		// Inherit class (static) properties from parent.
		_.merge( fsm, parent );
	
		// Set the prototype chain to inherit from `parent`, without calling
		// `parent`'s constructor function.
		Ctor.prototype = parent.prototype;
		fsm.prototype = new Ctor();
	
		// Add prototype properties (instance properties) to the subclass,
		// if supplied.
		if ( protoProps ) {
			_.extend( fsm.prototype, protoProps );
			_.merge( machObj, _.transform( protoProps, function( accum, val, key ) {
				if ( _machKeys.indexOf( key ) !== -1 ) {
					accum[ key ] = val;
				}
			} ) );
		}
	
		// Add static properties to the constructor function, if supplied.
		if ( staticProps ) {
			_.merge( fsm, staticProps );
		}
	
		// Correctly set child's `prototype.constructor`.
		fsm.prototype.constructor = fsm;
	
		// Set a convenience property in case the parent's prototype is needed later.
		fsm.__super__ = parent.prototype;
		return fsm;
	};
	
	function createUUID() {
		var s = [];
		var hexDigits = "0123456789abcdef";
		for ( var i = 0; i < 36; i++ ) {
			s[ i ] = hexDigits.substr( Math.floor( Math.random() * 0x10 ), 1 );
		}
		s[ 14 ] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
		/* jshint ignore:start */
		s[ 19 ] = hexDigits.substr( ( s[ 19 ] & 0x3 ) | 0x8, 1 ); // bits 6-7 of the clock_seq_hi_and_reserved to 01
		/* jshint ignore:end */
		s[ 8 ] = s[ 13 ] = s[ 18 ] = s[ 23 ] = "-";
		return s.join( "" );
	}
	
	module.exports = {
		createUUID: createUUID,
		extend: extend,
		getDefaultBehavioralOptions: getDefaultBehavioralOptions,
		getDefaultOptions: getDefaultBehavioralOptions,
		getDefaultClientMeta: getDefaultClientMeta,
		getChildFsmInstance: getChildFsmInstance,
		getLeaklessArgs: getLeaklessArgs,
		listenToChild: listenToChild,
		makeFsmNamespace: makeFsmNamespace
	};


/***/ }),
/* 4 */
/***/ (function(module, exports) {

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
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

	var BehavioralFsm = __webpack_require__( 6 );
	var utils = __webpack_require__( 3 );
	var _ = __webpack_require__( 1 );
	
	var Fsm = {
		constructor: function() {
			BehavioralFsm.apply( this, arguments );
			this.ensureClientMeta();
		},
		initClient: function initClient() {
			var initialState = this.initialState;
			if ( !initialState ) {
				throw new Error( "You must specify an initial state for this FSM" );
			}
			if ( !this.states[ initialState ] ) {
				throw new Error( "The initial state specified does not exist in the states object." );
			}
			this.transition( initialState );
		},
		ensureClientMeta: function ensureClientMeta() {
			if ( !this._stamped ) {
				this._stamped = true;
				_.defaults( this, _.cloneDeep( utils.getDefaultClientMeta() ) );
				this.initClient();
			}
			return this;
		},
	
		ensureClientArg: function( args ) {
			var _args = args;
			// we need to test the args and verify that if a client arg has
			// been passed, it must be this FSM instance (this isn't a behavioral FSM)
			if ( typeof _args[ 0 ] === "object" && !( "inputType" in _args[ 0 ] ) && _args[ 0 ] !== this ) {
				_args.splice( 0, 1, this );
			} else if ( typeof _args[ 0 ] !== "object" || ( typeof _args[ 0 ] === "object" && ( "inputType" in _args[ 0 ] ) ) ) {
				_args.unshift( this );
			}
			return _args;
		},
	
		getHandlerArgs: function( args, isCatchAll ) {
			// index 0 is the client, index 1 is inputType
			// if we're in a catch-all handler, input type needs to be included in the args
			// inputType might be an object, so we need to just get the inputType string if so
			var _args = args;
			var input = _args[ 1 ];
			if ( typeof inputType === "object" ) {
				_args.splice( 1, 1, input.inputType );
			}
			return isCatchAll ?
				_args.slice( 1 ) :
				_args.slice( 2 );
		},
	
		getSystemHandlerArgs: function( args, client ) {
			return args;
		},
	
		// "classic" machina FSM do not emit the client property on events (which would be the FSM itself)
		buildEventPayload: function() {
			var args = this.ensureClientArg( utils.getLeaklessArgs( arguments ) );
			var data = args[ 1 ];
			if ( _.isPlainObject( data ) ) {
				return _.extend( data, { namespace: this.namespace } );
			} else {
				return { data: data || null, namespace: this.namespace };
			}
		}
	};
	
	_.each( [
		"handle",
		"transition",
		"deferUntilTransition",
		"processQueue",
		"clearQueue"
	], function( methodWithClientInjected ) {
		Fsm[ methodWithClientInjected ] = function() {
			var args = this.ensureClientArg( utils.getLeaklessArgs( arguments ) );
			return BehavioralFsm.prototype[ methodWithClientInjected ].apply( this, args );
		};
	} );
	
	Fsm = BehavioralFsm.extend( Fsm );
	
	module.exports = Fsm;


/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

	var _ = __webpack_require__( 1 );
	var utils = __webpack_require__( 3 );
	var emitter = __webpack_require__( 2 );
	var topLevelEmitter = emitter.instance;
	var events = __webpack_require__( 4 );
	
	var MACHINA_PROP = "__machina__";
	
	function BehavioralFsm( options ) {
		_.extend( this, options );
		_.defaults( this, utils.getDefaultBehavioralOptions() );
		this.initialize.apply( this, arguments );
		topLevelEmitter.emit( events.NEW_FSM, this );
	}
	
	_.extend( BehavioralFsm.prototype, {
		initialize: function() {},
	
		initClient: function initClient( client ) {
			var initialState = this.initialState;
			if ( !initialState ) {
				throw new Error( "You must specify an initial state for this FSM" );
			}
			if ( !this.states[ initialState ] ) {
				throw new Error( "The initial state specified does not exist in the states object." );
			}
			this.transition( client, initialState );
		},
	
		configForState: function configForState( newState ) {
			var newStateObj = this.states[ newState ];
			var child;
			_.each( this.hierarchy, function( childListener, key ) {
				if ( childListener && typeof childListener.off === "function" ) {
					childListener.off();
				}
			} );
	
			if ( newStateObj._child ) {
				newStateObj._child = utils.getChildFsmInstance( newStateObj._child );
				child = newStateObj._child && newStateObj._child.instance;
				this.hierarchy[ child.namespace ] = utils.listenToChild( this, child );
			}
	
			return child;
		},
	
		ensureClientMeta: function ensureClientMeta( client ) {
			if ( typeof client !== "object" ) {
				throw new Error( "An FSM client must be an object." );
			}
			client[ MACHINA_PROP ] = client[ MACHINA_PROP ] || {};
			if ( !client[ MACHINA_PROP ][ this.namespace ] ) {
				client[ MACHINA_PROP ][ this.namespace ] = _.cloneDeep( utils.getDefaultClientMeta() );
				this.initClient( client );
			}
			return client[ MACHINA_PROP ][ this.namespace ];
		},
	
		buildEventPayload: function( client, data ) {
			if ( _.isPlainObject( data ) ) {
				return _.extend( data, { client: client, namespace: this.namespace } );
			} else {
				return { client: client, data: data || null, namespace: this.namespace };
			}
		},
	
		getHandlerArgs: function( args, isCatchAll ) {
			// index 0 is the client, index 1 is inputType
			// if we're in a catch-all handler, input type needs to be included in the args
			// inputType might be an object, so we need to just get the inputType string if so
			var _args = args.slice( 0 );
			var input = _args[ 1 ];
			if ( typeof input === "object" ) {
				_args.splice( 1, 1, input.inputType );
			}
			return isCatchAll ?
				_args :
				[ _args[ 0 ] ].concat( _args.slice( 2 ) );
		},
	
		getSystemHandlerArgs: function( args, client ) {
			return [ client ].concat( args );
		},
	
		handle: function( client, input ) {
			var inputDef = input;
			if ( typeof input === "undefined" ) {
				throw new Error( "The input argument passed to the FSM's handle method is undefined. Did you forget to pass the input name?" );
			}
			if ( typeof input === "string" ) {
				inputDef = { inputType: input, delegated: false, ticket: undefined };
			}
			var clientMeta = this.ensureClientMeta( client );
			var args = utils.getLeaklessArgs( arguments );
			if ( typeof input !== "object" ) {
				args.splice( 1, 1, inputDef );
			}
			clientMeta.currentActionArgs = args.slice( 1 );
			var currentState = clientMeta.state;
			var stateObj = this.states[ currentState ];
			var handlerName;
			var handler;
			var isCatchAll = false;
			var child;
			var result;
			var action;
			if ( !clientMeta.inExitHandler ) {
				child = this.configForState( currentState );
				if ( child && !this.pendingDelegations[ inputDef.ticket ] && !inputDef.bubbling ) {
					inputDef.ticket = ( inputDef.ticket || utils.createUUID() );
					inputDef.delegated = true;
					this.pendingDelegations[ inputDef.ticket ] = { delegatedTo: child.namespace };
					// WARNING - returning a value from `handle` on child FSMs is not really supported.
					// If you need to return values from child FSM input handlers, use events instead.
					result = child.handle.apply( child, args );
				} else {
					if ( inputDef.ticket && this.pendingDelegations[ inputDef.ticket ] ) {
						delete this.pendingDelegations[ inputDef.ticket ];
					}
					handlerName = stateObj[ inputDef.inputType ] ? inputDef.inputType : "*";
					isCatchAll = ( handlerName === "*" );
					handler = ( stateObj[ handlerName ] || this[ handlerName ] ) || this[ "*" ];
					action = clientMeta.state + "." + handlerName;
					clientMeta.currentAction = action;
					var eventPayload = this.buildEventPayload(
						client,
						{ inputType: inputDef.inputType, delegated: inputDef.delegated, ticket: inputDef.ticket }
					);
					if ( !handler ) {
						this.emit( events.NO_HANDLER, _.extend( { args: args }, eventPayload ) );
					} else {
						this.emit( events.HANDLING, eventPayload );
						if ( typeof handler === "function" ) {
							result = handler.apply( this, this.getHandlerArgs( args, isCatchAll ) );
						} else {
							result = handler;
							this.transition( client, handler );
						}
						this.emit( events.HANDLED, eventPayload );
					}
					clientMeta.priorAction = clientMeta.currentAction;
					clientMeta.currentAction = "";
					clientMeta.currentActionArgs = undefined;
				}
			}
			return result;
		},
	
		transition: function( client, newState ) {
			var clientMeta = this.ensureClientMeta( client );
			var curState = clientMeta.state;
			var curStateObj = this.states[ curState ];
			var newStateObj = this.states[ newState ];
			var child;
			var args = utils.getLeaklessArgs( arguments ).slice( 2 );
			if ( !clientMeta.inExitHandler && newState !== curState ) {
				if ( newStateObj ) {
					child = this.configForState( newState );
					if ( curStateObj && curStateObj._onExit ) {
						clientMeta.inExitHandler = true;
						curStateObj._onExit.call( this, client );
						clientMeta.inExitHandler = false;
					}
					clientMeta.targetReplayState = newState;
					clientMeta.priorState = curState;
					clientMeta.state = newState;
					var eventPayload = this.buildEventPayload( client, {
						fromState: clientMeta.priorState,
						action: clientMeta.currentAction,
						toState: newState
					} );
					this.emit( events.TRANSITION, eventPayload );
					if ( newStateObj._onEnter ) {
						newStateObj._onEnter.apply( this, this.getSystemHandlerArgs( args, client ) );
					}
					this.emit( events.TRANSITIONED, eventPayload );
					if ( child ) {
						child.handle( client, "_reset" );
					}
	
					if ( clientMeta.targetReplayState === newState ) {
						this.processQueue( client, events.NEXT_TRANSITION );
					}
					return;
				}
				this.emit( events.INVALID_STATE, this.buildEventPayload( client, {
					state: clientMeta.state,
					attemptedState: newState
				} ) );
			}
		},
	
		deferUntilTransition: function( client, stateName ) {
			var clientMeta = this.ensureClientMeta( client );
			if ( clientMeta.currentActionArgs ) {
				var queued = {
					type: events.NEXT_TRANSITION,
					untilState: stateName,
					args: clientMeta.currentActionArgs
				};
				clientMeta.inputQueue.push( queued );
				var eventPayload = this.buildEventPayload( client, {
					state: clientMeta.state,
					queuedArgs: queued
				} );
				this.emit( events.DEFERRED, eventPayload );
			}
		},
	
		deferAndTransition: function( client, stateName ) {
			this.deferUntilTransition( client, stateName );
			this.transition( client, stateName );
		},
	
		processQueue: function( client ) {
			var clientMeta = this.ensureClientMeta( client );
			var filterFn = function( item ) {
				return ( ( !item.untilState ) || ( item.untilState === clientMeta.state ) );
			};
			var toProcess = _.filter( clientMeta.inputQueue, filterFn );
			clientMeta.inputQueue = _.difference( clientMeta.inputQueue, toProcess );
			_.each( toProcess, function( item ) {
				this.handle.apply( this, [ client ].concat( item.args ) );
			}.bind( this ) );
		},
	
		clearQueue: function( client, name ) {
			var clientMeta = this.ensureClientMeta( client );
			if ( !name ) {
				clientMeta.inputQueue = [];
			} else {
				var filter = function( evnt ) {
					return ( name ? evnt.untilState !== name : true );
				};
				clientMeta.inputQueue = _.filter( clientMeta.inputQueue, filter );
			}
		},
	
		compositeState: function( client ) {
			var clientMeta = this.ensureClientMeta( client );
			var state = clientMeta.state;
			var child = this.states[state]._child && this.states[state]._child.instance;
			if ( child ) {
				state += "." + child.compositeState( client );
			}
			return state;
		}
	}, emitter.getInstance() );
	
	BehavioralFsm.extend = utils.extend;
	
	module.exports = BehavioralFsm;


/***/ })
/******/ ])
});
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay91bml2ZXJzYWxNb2R1bGVEZWZpbml0aW9uIiwid2VicGFjazovLy93ZWJwYWNrL2Jvb3RzdHJhcCAyNTUxODVlZDk3ZTE5MjEzN2U1ZSIsIndlYnBhY2s6Ly8vLi9zcmMvbWFjaGluYS5qcyIsIndlYnBhY2s6Ly8vZXh0ZXJuYWwge1wicm9vdFwiOlwiX1wiLFwiY29tbW9uanNcIjpcImxvZGFzaFwiLFwiY29tbW9uanMyXCI6XCJsb2Rhc2hcIixcImFtZFwiOlwibG9kYXNoXCJ9Iiwid2VicGFjazovLy8uL3NyYy9lbWl0dGVyLmpzIiwid2VicGFjazovLy8uL3NyYy91dGlscy5qcyIsIndlYnBhY2s6Ly8vLi9zcmMvZXZlbnRzLmpzIiwid2VicGFjazovLy8uL3NyYy9Gc20uanMiLCJ3ZWJwYWNrOi8vLy4vc3JjL0JlaGF2aW9yYWxGc20uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUM7QUFDRCxPO0FDVkE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsdUJBQWU7QUFDZjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7Ozs7OztBQ3RDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBQzs7Ozs7OztBQ1ZELGdEOzs7Ozs7QUNBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFNO0FBQ047QUFDQTtBQUNBLFFBQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU07QUFD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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUk7QUFDSjtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSTtBQUNKO0FBQ0E7QUFDQSxHQUFFOztBQUVGO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBRztBQUNILEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFHO0FBQ0g7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBQzs7QUFFRDs7QUFFQSIsImZpbGUiOiJtYWNoaW5hLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIHdlYnBhY2tVbml2ZXJzYWxNb2R1bGVEZWZpbml0aW9uKHJvb3QsIGZhY3RvcnkpIHtcblx0aWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKVxuXHRcdG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKFwibG9kYXNoXCIpKTtcblx0ZWxzZSBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpXG5cdFx0ZGVmaW5lKFtcImxvZGFzaFwiXSwgZmFjdG9yeSk7XG5cdGVsc2UgaWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKVxuXHRcdGV4cG9ydHNbXCJtYWNoaW5hXCJdID0gZmFjdG9yeShyZXF1aXJlKFwibG9kYXNoXCIpKTtcblx0ZWxzZVxuXHRcdHJvb3RbXCJtYWNoaW5hXCJdID0gZmFjdG9yeShyb290W1wiX1wiXSk7XG59KSh0aGlzLCBmdW5jdGlvbihfX1dFQlBBQ0tfRVhURVJOQUxfTU9EVUxFXzFfXykge1xucmV0dXJuIFxuXG5cbi8vIFdFQlBBQ0sgRk9PVEVSIC8vXG4vLyB3ZWJwYWNrL3VuaXZlcnNhbE1vZHVsZURlZmluaXRpb24iLCIgXHQvLyBUaGUgbW9kdWxlIGNhY2hlXG4gXHR2YXIgaW5zdGFsbGVkTW9kdWxlcyA9IHt9O1xuXG4gXHQvLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuIFx0ZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXG4gXHRcdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuIFx0XHRpZihpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSlcbiBcdFx0XHRyZXR1cm4gaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0uZXhwb3J0cztcblxuIFx0XHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuIFx0XHR2YXIgbW9kdWxlID0gaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0gPSB7XG4gXHRcdFx0ZXhwb3J0czoge30sXG4gXHRcdFx0aWQ6IG1vZHVsZUlkLFxuIFx0XHRcdGxvYWRlZDogZmFsc2VcbiBcdFx0fTtcblxuIFx0XHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cbiBcdFx0bW9kdWxlc1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cbiBcdFx0Ly8gRmxhZyB0aGUgbW9kdWxlIGFzIGxvYWRlZFxuIFx0XHRtb2R1bGUubG9hZGVkID0gdHJ1ZTtcblxuIFx0XHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuIFx0XHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG4gXHR9XG5cblxuIFx0Ly8gZXhwb3NlIHRoZSBtb2R1bGVzIG9iamVjdCAoX193ZWJwYWNrX21vZHVsZXNfXylcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubSA9IG1vZHVsZXM7XG5cbiBcdC8vIGV4cG9zZSB0aGUgbW9kdWxlIGNhY2hlXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmMgPSBpbnN0YWxsZWRNb2R1bGVzO1xuXG4gXHQvLyBfX3dlYnBhY2tfcHVibGljX3BhdGhfX1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5wID0gXCJcIjtcblxuIFx0Ly8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4gXHRyZXR1cm4gX193ZWJwYWNrX3JlcXVpcmVfXygwKTtcblxuXG5cbi8vIFdFQlBBQ0sgRk9PVEVSIC8vXG4vLyB3ZWJwYWNrL2Jvb3RzdHJhcCAyNTUxODVlZDk3ZTE5MjEzN2U1ZSIsInZhciBfID0gcmVxdWlyZSggXCJsb2Rhc2hcIiApO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCBcIi4vZW1pdHRlclwiICk7XG5cbm1vZHVsZS5leHBvcnRzID0gXy5tZXJnZSggZW1pdHRlci5pbnN0YW5jZSwge1xuXHRGc206IHJlcXVpcmUoIFwiLi9Gc21cIiApLFxuXHRCZWhhdmlvcmFsRnNtOiByZXF1aXJlKCBcIi4vQmVoYXZpb3JhbEZzbVwiICksXG5cdHV0aWxzOiByZXF1aXJlKCBcIi4vdXRpbHNcIiApLFxuXHRldmVudExpc3RlbmVyczoge1xuXHRcdG5ld0ZzbTogW11cblx0fVxufSApO1xuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXRUJQQUNLIEZPT1RFUlxuLy8gLi9zcmMvbWFjaGluYS5qc1xuLy8gbW9kdWxlIGlkID0gMFxuLy8gbW9kdWxlIGNodW5rcyA9IDAiLCJtb2R1bGUuZXhwb3J0cyA9IF9fV0VCUEFDS19FWFRFUk5BTF9NT0RVTEVfMV9fO1xuXG5cbi8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV0VCUEFDSyBGT09URVJcbi8vIGV4dGVybmFsIHtcInJvb3RcIjpcIl9cIixcImNvbW1vbmpzXCI6XCJsb2Rhc2hcIixcImNvbW1vbmpzMlwiOlwibG9kYXNoXCIsXCJhbWRcIjpcImxvZGFzaFwifVxuLy8gbW9kdWxlIGlkID0gMVxuLy8gbW9kdWxlIGNodW5rcyA9IDAiLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCBcIi4vdXRpbHNcIiApO1xudmFyIF8gPSByZXF1aXJlKCBcImxvZGFzaFwiICk7XG5cbmZ1bmN0aW9uIGdldEluc3RhbmNlKCkge1xuXHRyZXR1cm4ge1xuXHRcdGVtaXQ6IGZ1bmN0aW9uKCBldmVudE5hbWUgKSB7XG5cdFx0XHR2YXIgYXJncyA9IHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICk7XG5cdFx0XHRpZiAoIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIFwiKlwiIF0gKSB7XG5cdFx0XHRcdF8uZWFjaCggdGhpcy5ldmVudExpc3RlbmVyc1sgXCIqXCIgXSwgZnVuY3Rpb24oIGNhbGxiYWNrICkge1xuXHRcdFx0XHRcdGlmICggIXRoaXMudXNlU2FmZUVtaXQgKSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSggdGhpcywgYXJncyApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSggdGhpcywgYXJncyApO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoIGV4Y2VwdGlvbiApIHtcblx0XHRcdFx0XHRcdFx0LyogaXN0YW5idWwgaWdub3JlIGVsc2UgICovXG5cdFx0XHRcdFx0XHRcdGlmICggY29uc29sZSAmJiB0eXBlb2YgY29uc29sZS5sb2cgIT09IFwidW5kZWZpbmVkXCIgKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coIGV4Y2VwdGlvbi5zdGFjayApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0aGlzICk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdICkge1xuXHRcdFx0XHRfLmVhY2goIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdLCBmdW5jdGlvbiggY2FsbGJhY2sgKSB7XG5cdFx0XHRcdFx0aWYgKCAhdGhpcy51c2VTYWZlRW1pdCApIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrLmFwcGx5KCB0aGlzLCBhcmdzLnNsaWNlKCAxICkgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y2FsbGJhY2suYXBwbHkoIHRoaXMsIGFyZ3Muc2xpY2UoIDEgKSApO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoIGV4Y2VwdGlvbiApIHtcblx0XHRcdFx0XHRcdFx0LyogaXN0YW5idWwgaWdub3JlIGVsc2UgICovXG5cdFx0XHRcdFx0XHRcdGlmICggY29uc29sZSAmJiB0eXBlb2YgY29uc29sZS5sb2cgIT09IFwidW5kZWZpbmVkXCIgKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coIGV4Y2VwdGlvbi5zdGFjayApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0aGlzICk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdG9uOiBmdW5jdGlvbiggZXZlbnROYW1lLCBjYWxsYmFjayApIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNlbGYuZXZlbnRMaXN0ZW5lcnMgPSBzZWxmLmV2ZW50TGlzdGVuZXJzIHx8IHsgXCIqXCI6IFtdIH07XG5cdFx0XHRpZiAoICFzZWxmLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSApIHtcblx0XHRcdFx0c2VsZi5ldmVudExpc3RlbmVyc1sgZXZlbnROYW1lIF0gPSBbXTtcblx0XHRcdH1cblx0XHRcdHNlbGYuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdLnB1c2goIGNhbGxiYWNrICk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRldmVudE5hbWU6IGV2ZW50TmFtZSxcblx0XHRcdFx0Y2FsbGJhY2s6IGNhbGxiYWNrLFxuXHRcdFx0XHRvZmY6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHNlbGYub2ZmKCBldmVudE5hbWUsIGNhbGxiYWNrICk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSxcblxuXHRcdG9mZjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgY2FsbGJhY2sgKSB7XG5cdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzID0gdGhpcy5ldmVudExpc3RlbmVycyB8fCB7IFwiKlwiOiBbXSB9O1xuXHRcdFx0aWYgKCAhZXZlbnROYW1lICkge1xuXHRcdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzID0ge307XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIGNhbGxiYWNrICkge1xuXHRcdFx0XHRcdHRoaXMuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdID0gXy53aXRob3V0KCB0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSwgY2FsbGJhY2sgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0Z2V0SW5zdGFuY2U6IGdldEluc3RhbmNlLFxuXHRpbnN0YW5jZTogZ2V0SW5zdGFuY2UoKVxufTtcblxuXG5cbi8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV0VCUEFDSyBGT09URVJcbi8vIC4vc3JjL2VtaXR0ZXIuanNcbi8vIG1vZHVsZSBpZCA9IDJcbi8vIG1vZHVsZSBjaHVua3MgPSAwIiwidmFyIHNsaWNlID0gW10uc2xpY2U7XG52YXIgZXZlbnRzID0gcmVxdWlyZSggXCIuL2V2ZW50cy5qc1wiICk7XG52YXIgXyA9IHJlcXVpcmUoIFwibG9kYXNoXCIgKTtcblxudmFyIG1ha2VGc21OYW1lc3BhY2UgPSAoIGZ1bmN0aW9uKCkge1xuXHR2YXIgbWFjaGluYUNvdW50ID0gMDtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiBcImZzbS5cIiArIG1hY2hpbmFDb3VudCsrO1xuXHR9O1xufSApKCk7XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRCZWhhdmlvcmFsT3B0aW9ucygpIHtcblx0cmV0dXJuIHtcblx0XHRpbml0aWFsU3RhdGU6IFwidW5pbml0aWFsaXplZFwiLFxuXHRcdGV2ZW50TGlzdGVuZXJzOiB7XG5cdFx0XHRcIipcIjogW11cblx0XHR9LFxuXHRcdHN0YXRlczoge30sXG5cdFx0bmFtZXNwYWNlOiBtYWtlRnNtTmFtZXNwYWNlKCksXG5cdFx0dXNlU2FmZUVtaXQ6IGZhbHNlLFxuXHRcdGhpZXJhcmNoeToge30sXG5cdFx0cGVuZGluZ0RlbGVnYXRpb25zOiB7fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXREZWZhdWx0Q2xpZW50TWV0YSgpIHtcblx0cmV0dXJuIHtcblx0XHRpbnB1dFF1ZXVlOiBbXSxcblx0XHR0YXJnZXRSZXBsYXlTdGF0ZTogXCJcIixcblx0XHRzdGF0ZTogdW5kZWZpbmVkLFxuXHRcdHByaW9yU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRwcmlvckFjdGlvbjogXCJcIixcblx0XHRjdXJyZW50QWN0aW9uOiBcIlwiLFxuXHRcdGN1cnJlbnRBY3Rpb25BcmdzOiB1bmRlZmluZWQsXG5cdFx0aW5FeGl0SGFuZGxlcjogZmFsc2Vcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0TGVha2xlc3NBcmdzKCBhcmdzLCBzdGFydElkeCApIHtcblx0dmFyIHJlc3VsdCA9IFtdO1xuXHRmb3IgKCB2YXIgaSA9ICggc3RhcnRJZHggfHwgMCApOyBpIDwgYXJncy5sZW5ndGg7IGkrKyApIHtcblx0XHRyZXN1bHRbIGkgXSA9IGFyZ3NbIGkgXTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuLypcblx0aGFuZGxlIC0+XG5cdFx0Y2hpbGQgPSBzdGF0ZU9iai5fY2hpbGQgJiYgc3RhdGVPYmouX2NoaWxkLmluc3RhbmNlO1xuXG5cdHRyYW5zaXRpb24gLT5cblx0XHRuZXdTdGF0ZU9iai5fY2hpbGQgPSBnZXRDaGlsZEZzbUluc3RhbmNlKCBuZXdTdGF0ZU9iai5fY2hpbGQgKTtcblx0XHRjaGlsZCA9IG5ld1N0YXRlT2JqLl9jaGlsZCAmJiBuZXdTdGF0ZU9iai5fY2hpbGQuaW5zdGFuY2U7XG4qL1xuZnVuY3Rpb24gZ2V0Q2hpbGRGc21JbnN0YW5jZSggY29uZmlnICkge1xuXHRpZiAoICFjb25maWcgKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHZhciBjaGlsZEZzbURlZmluaXRpb24gPSB7fTtcblx0aWYgKCB0eXBlb2YgY29uZmlnID09PSBcIm9iamVjdFwiICkge1xuXHRcdC8vIGlzIHRoaXMgYSBjb25maWcgb2JqZWN0IHdpdGggYSBmYWN0b3J5P1xuXHRcdGlmICggY29uZmlnLmZhY3RvcnkgKSB7XG5cdFx0XHRjaGlsZEZzbURlZmluaXRpb24gPSBjb25maWc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGFzc3VtaW5nIHRoaXMgaXMgYSBtYWNoaW5hIGluc3RhbmNlXG5cdFx0XHRjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdFx0fTtcblx0XHR9XG5cdH0gZWxzZSBpZiAoIHR5cGVvZiBjb25maWcgPT09IFwiZnVuY3Rpb25cIiApIHtcblx0XHRjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSA9IGNvbmZpZztcblx0fVxuXHRjaGlsZEZzbURlZmluaXRpb24uaW5zdGFuY2UgPSBjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSgpO1xuXHRyZXR1cm4gY2hpbGRGc21EZWZpbml0aW9uO1xufVxuXG5mdW5jdGlvbiBsaXN0ZW5Ub0NoaWxkKCBmc20sIGNoaWxkICkge1xuXHQvLyBOZWVkIHRvIGludmVzdGlnYXRlIHBvdGVudGlhbCBmb3IgZGlzY2FyZGVkIGV2ZW50XG5cdC8vIGxpc3RlbmVyIG1lbW9yeSBsZWFrIGluIGxvbmctcnVubmluZywgZGVlcGx5LW5lc3RlZCBoaWVyYXJjaGllcy5cblx0cmV0dXJuIGNoaWxkLm9uKCBcIipcIiwgZnVuY3Rpb24oIGV2ZW50TmFtZSwgZGF0YSApIHtcblx0XHRzd2l0Y2ggKCBldmVudE5hbWUgKSB7XG5cdFx0XHRjYXNlIGV2ZW50cy5OT19IQU5ETEVSOlxuXHRcdFx0XHRpZiAoICFkYXRhLnRpY2tldCAmJiAhZGF0YS5kZWxlZ2F0ZWQgJiYgZGF0YS5uYW1lc3BhY2UgIT09IGZzbS5uYW1lc3BhY2UgKSB7XG5cdFx0XHRcdFx0Ly8gT2sgLSB3ZSdyZSBkZWFsaW5nIHcvIGEgY2hpbGQgaGFuZGxpbmcgaW5wdXQgdGhhdCBzaG91bGQgYnViYmxlIHVwXG5cdFx0XHRcdFx0ZGF0YS5hcmdzWyAxIF0uYnViYmxpbmcgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIHdlIGRvIE5PVCBidWJibGUgX3Jlc2V0IGlucHV0cyB1cCB0byB0aGUgcGFyZW50XG5cdFx0XHRcdGlmICggZGF0YS5pbnB1dFR5cGUgIT09IFwiX3Jlc2V0XCIgKSB7XG5cdFx0XHRcdFx0ZnNtLmhhbmRsZS5hcHBseSggZnNtLCBkYXRhLmFyZ3MgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgZXZlbnRzLkhBTkRMSU5HIDpcblx0XHRcdFx0dmFyIHRpY2tldCA9IGRhdGEudGlja2V0O1xuXHRcdFx0XHRpZiAoIHRpY2tldCAmJiBmc20ucGVuZGluZ0RlbGVnYXRpb25zWyB0aWNrZXQgXSApIHtcblx0XHRcdFx0XHRkZWxldGUgZnNtLnBlbmRpbmdEZWxlZ2F0aW9uc1sgdGlja2V0IF07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZnNtLmVtaXQoIGV2ZW50TmFtZSwgZGF0YSApOyAvLyBwb3NzaWJseSB0cmFuc2Zvcm0gcGF5bG9hZD9cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRmc20uZW1pdCggZXZlbnROYW1lLCBkYXRhICk7IC8vIHBvc3NpYmx5IHRyYW5zZm9ybSBwYXlsb2FkP1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0gKTtcbn1cblxuLy8gX21hY2hLZXlzIGFyZSBtZW1iZXJzIHdlIHdhbnQgdG8gdHJhY2sgYWNyb3NzIHRoZSBwcm90b3R5cGUgY2hhaW4gb2YgYW4gZXh0ZW5kZWQgRlNNIGNvbnN0cnVjdG9yXG4vLyBTaW5jZSB3ZSB3YW50IHRvIGV2ZW50dWFsbHkgbWVyZ2UgdGhlIGFnZ3JlZ2F0ZSBvZiB0aG9zZSB2YWx1ZXMgb250byB0aGUgaW5zdGFuY2Ugc28gdGhhdCBGU01zXG4vLyB0aGF0IHNoYXJlIHRoZSBzYW1lIGV4dGVuZGVkIHByb3RvdHlwZSB3b24ndCBzaGFyZSBzdGF0ZSAqb24qIHRob3NlIHByb3RvdHlwZXMuXG52YXIgX21hY2hLZXlzID0gWyBcInN0YXRlc1wiLCBcImluaXRpYWxTdGF0ZVwiIF07XG52YXIgZXh0ZW5kID0gZnVuY3Rpb24oIHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzICkge1xuXHR2YXIgcGFyZW50ID0gdGhpcztcblx0dmFyIGZzbTsgLy8gcGxhY2Vob2xkZXIgZm9yIGluc3RhbmNlIGNvbnN0cnVjdG9yXG5cdHZhciBtYWNoT2JqID0ge307IC8vIG9iamVjdCB1c2VkIHRvIGhvbGQgaW5pdGlhbFN0YXRlICYgc3RhdGVzIGZyb20gcHJvdG90eXBlIGZvciBpbnN0YW5jZS1sZXZlbCBtZXJnaW5nXG5cdHZhciBDdG9yID0gZnVuY3Rpb24oKSB7fTsgLy8gcGxhY2Vob2xkZXIgY3RvciBmdW5jdGlvbiB1c2VkIHRvIGluc2VydCBsZXZlbCBpbiBwcm90b3R5cGUgY2hhaW5cblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmICggcHJvdG9Qcm9wcyAmJiBwcm90b1Byb3BzLmhhc093blByb3BlcnR5KCBcImNvbnN0cnVjdG9yXCIgKSApIHtcblx0XHRmc20gPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdC8vIFRoZSBkZWZhdWx0IG1hY2hpbmEgY29uc3RydWN0b3IgKHdoZW4gdXNpbmcgaW5oZXJpdGFuY2UpIGNyZWF0ZXMgYVxuXHRcdC8vIGRlZXAgY29weSBvZiB0aGUgc3RhdGVzL2luaXRpYWxTdGF0ZSB2YWx1ZXMgZnJvbSB0aGUgcHJvdG90eXBlIGFuZFxuXHRcdC8vIGV4dGVuZHMgdGhlbSBvdmVyIHRoZSBpbnN0YW5jZSBzbyB0aGF0IHRoZXknbGwgYmUgaW5zdGFuY2UtbGV2ZWwuXG5cdFx0Ly8gSWYgYW4gb3B0aW9ucyBhcmcgKGFyZ3NbMF0pIGlzIHBhc3NlZCBpbiwgYSBzdGF0ZXMgb3IgaW50aWFsU3RhdGVcblx0XHQvLyB2YWx1ZSB3aWxsIGJlIHByZWZlcnJlZCBvdmVyIGFueSBkYXRhIHB1bGxlZCB1cCBmcm9tIHRoZSBwcm90b3R5cGUuXG5cdFx0ZnNtID0gZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgYXJncyA9IHNsaWNlLmNhbGwoIGFyZ3VtZW50cywgMCApO1xuXHRcdFx0YXJnc1sgMCBdID0gYXJnc1sgMCBdIHx8IHt9O1xuXHRcdFx0dmFyIGJsZW5kZWRTdGF0ZTtcblx0XHRcdHZhciBpbnN0YW5jZVN0YXRlcyA9IGFyZ3NbIDAgXS5zdGF0ZXMgfHwge307XG5cdFx0XHRibGVuZGVkU3RhdGUgPSBfLm1lcmdlKCBfLmNsb25lRGVlcCggbWFjaE9iaiApLCB7IHN0YXRlczogaW5zdGFuY2VTdGF0ZXMgfSApO1xuXHRcdFx0YmxlbmRlZFN0YXRlLmluaXRpYWxTdGF0ZSA9IGFyZ3NbIDAgXS5pbml0aWFsU3RhdGUgfHwgdGhpcy5pbml0aWFsU3RhdGU7XG5cdFx0XHRfLmV4dGVuZCggYXJnc1sgMCBdLCBibGVuZGVkU3RhdGUgKTtcblx0XHRcdHBhcmVudC5hcHBseSggdGhpcywgYXJncyApO1xuXHRcdH07XG5cdH1cblxuXHQvLyBJbmhlcml0IGNsYXNzIChzdGF0aWMpIHByb3BlcnRpZXMgZnJvbSBwYXJlbnQuXG5cdF8ubWVyZ2UoIGZzbSwgcGFyZW50ICk7XG5cblx0Ly8gU2V0IHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gaW5oZXJpdCBmcm9tIGBwYXJlbnRgLCB3aXRob3V0IGNhbGxpbmdcblx0Ly8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cblx0Q3Rvci5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXHRmc20ucHJvdG90eXBlID0gbmV3IEN0b3IoKTtcblxuXHQvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcblx0Ly8gaWYgc3VwcGxpZWQuXG5cdGlmICggcHJvdG9Qcm9wcyApIHtcblx0XHRfLmV4dGVuZCggZnNtLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyApO1xuXHRcdF8ubWVyZ2UoIG1hY2hPYmosIF8udHJhbnNmb3JtKCBwcm90b1Byb3BzLCBmdW5jdGlvbiggYWNjdW0sIHZhbCwga2V5ICkge1xuXHRcdFx0aWYgKCBfbWFjaEtleXMuaW5kZXhPZigga2V5ICkgIT09IC0xICkge1xuXHRcdFx0XHRhY2N1bVsga2V5IF0gPSB2YWw7XG5cdFx0XHR9XG5cdFx0fSApICk7XG5cdH1cblxuXHQvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cblx0aWYgKCBzdGF0aWNQcm9wcyApIHtcblx0XHRfLm1lcmdlKCBmc20sIHN0YXRpY1Byb3BzICk7XG5cdH1cblxuXHQvLyBDb3JyZWN0bHkgc2V0IGNoaWxkJ3MgYHByb3RvdHlwZS5jb25zdHJ1Y3RvcmAuXG5cdGZzbS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBmc207XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZCBsYXRlci5cblx0ZnNtLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cdHJldHVybiBmc207XG59O1xuXG5mdW5jdGlvbiBjcmVhdGVVVUlEKCkge1xuXHR2YXIgcyA9IFtdO1xuXHR2YXIgaGV4RGlnaXRzID0gXCIwMTIzNDU2Nzg5YWJjZGVmXCI7XG5cdGZvciAoIHZhciBpID0gMDsgaSA8IDM2OyBpKysgKSB7XG5cdFx0c1sgaSBdID0gaGV4RGlnaXRzLnN1YnN0ciggTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIDB4MTAgKSwgMSApO1xuXHR9XG5cdHNbIDE0IF0gPSBcIjRcIjsgLy8gYml0cyAxMi0xNSBvZiB0aGUgdGltZV9oaV9hbmRfdmVyc2lvbiBmaWVsZCB0byAwMDEwXG5cdC8qIGpzaGludCBpZ25vcmU6c3RhcnQgKi9cblx0c1sgMTkgXSA9IGhleERpZ2l0cy5zdWJzdHIoICggc1sgMTkgXSAmIDB4MyApIHwgMHg4LCAxICk7IC8vIGJpdHMgNi03IG9mIHRoZSBjbG9ja19zZXFfaGlfYW5kX3Jlc2VydmVkIHRvIDAxXG5cdC8qIGpzaGludCBpZ25vcmU6ZW5kICovXG5cdHNbIDggXSA9IHNbIDEzIF0gPSBzWyAxOCBdID0gc1sgMjMgXSA9IFwiLVwiO1xuXHRyZXR1cm4gcy5qb2luKCBcIlwiICk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRjcmVhdGVVVUlEOiBjcmVhdGVVVUlELFxuXHRleHRlbmQ6IGV4dGVuZCxcblx0Z2V0RGVmYXVsdEJlaGF2aW9yYWxPcHRpb25zOiBnZXREZWZhdWx0QmVoYXZpb3JhbE9wdGlvbnMsXG5cdGdldERlZmF1bHRPcHRpb25zOiBnZXREZWZhdWx0QmVoYXZpb3JhbE9wdGlvbnMsXG5cdGdldERlZmF1bHRDbGllbnRNZXRhOiBnZXREZWZhdWx0Q2xpZW50TWV0YSxcblx0Z2V0Q2hpbGRGc21JbnN0YW5jZTogZ2V0Q2hpbGRGc21JbnN0YW5jZSxcblx0Z2V0TGVha2xlc3NBcmdzOiBnZXRMZWFrbGVzc0FyZ3MsXG5cdGxpc3RlblRvQ2hpbGQ6IGxpc3RlblRvQ2hpbGQsXG5cdG1ha2VGc21OYW1lc3BhY2U6IG1ha2VGc21OYW1lc3BhY2Vcbn07XG5cblxuXG4vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFdFQlBBQ0sgRk9PVEVSXG4vLyAuL3NyYy91dGlscy5qc1xuLy8gbW9kdWxlIGlkID0gM1xuLy8gbW9kdWxlIGNodW5rcyA9IDAiLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0TkVYVF9UUkFOU0lUSU9OOiBcInRyYW5zaXRpb25cIixcblx0SEFORExJTkc6IFwiaGFuZGxpbmdcIixcblx0SEFORExFRDogXCJoYW5kbGVkXCIsXG5cdE5PX0hBTkRMRVI6IFwibm9oYW5kbGVyXCIsXG5cdFRSQU5TSVRJT046IFwidHJhbnNpdGlvblwiLFxuXHRUUkFOU0lUSU9ORUQ6IFwidHJhbnNpdGlvbmVkXCIsXG5cdElOVkFMSURfU1RBVEU6IFwiaW52YWxpZHN0YXRlXCIsXG5cdERFRkVSUkVEOiBcImRlZmVycmVkXCIsXG5cdE5FV19GU006IFwibmV3ZnNtXCJcbn07XG5cblxuXG4vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFdFQlBBQ0sgRk9PVEVSXG4vLyAuL3NyYy9ldmVudHMuanNcbi8vIG1vZHVsZSBpZCA9IDRcbi8vIG1vZHVsZSBjaHVua3MgPSAwIiwidmFyIEJlaGF2aW9yYWxGc20gPSByZXF1aXJlKCBcIi4vQmVoYXZpb3JhbEZzbVwiICk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCBcIi4vdXRpbHNcIiApO1xudmFyIF8gPSByZXF1aXJlKCBcImxvZGFzaFwiICk7XG5cbnZhciBGc20gPSB7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHRCZWhhdmlvcmFsRnNtLmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTtcblx0XHR0aGlzLmVuc3VyZUNsaWVudE1ldGEoKTtcblx0fSxcblx0aW5pdENsaWVudDogZnVuY3Rpb24gaW5pdENsaWVudCgpIHtcblx0XHR2YXIgaW5pdGlhbFN0YXRlID0gdGhpcy5pbml0aWFsU3RhdGU7XG5cdFx0aWYgKCAhaW5pdGlhbFN0YXRlICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIllvdSBtdXN0IHNwZWNpZnkgYW4gaW5pdGlhbCBzdGF0ZSBmb3IgdGhpcyBGU01cIiApO1xuXHRcdH1cblx0XHRpZiAoICF0aGlzLnN0YXRlc1sgaW5pdGlhbFN0YXRlIF0gKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoIFwiVGhlIGluaXRpYWwgc3RhdGUgc3BlY2lmaWVkIGRvZXMgbm90IGV4aXN0IGluIHRoZSBzdGF0ZXMgb2JqZWN0LlwiICk7XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNpdGlvbiggaW5pdGlhbFN0YXRlICk7XG5cdH0sXG5cdGVuc3VyZUNsaWVudE1ldGE6IGZ1bmN0aW9uIGVuc3VyZUNsaWVudE1ldGEoKSB7XG5cdFx0aWYgKCAhdGhpcy5fc3RhbXBlZCApIHtcblx0XHRcdHRoaXMuX3N0YW1wZWQgPSB0cnVlO1xuXHRcdFx0Xy5kZWZhdWx0cyggdGhpcywgXy5jbG9uZURlZXAoIHV0aWxzLmdldERlZmF1bHRDbGllbnRNZXRhKCkgKSApO1xuXHRcdFx0dGhpcy5pbml0Q2xpZW50KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGVuc3VyZUNsaWVudEFyZzogZnVuY3Rpb24oIGFyZ3MgKSB7XG5cdFx0dmFyIF9hcmdzID0gYXJncztcblx0XHQvLyB3ZSBuZWVkIHRvIHRlc3QgdGhlIGFyZ3MgYW5kIHZlcmlmeSB0aGF0IGlmIGEgY2xpZW50IGFyZyBoYXNcblx0XHQvLyBiZWVuIHBhc3NlZCwgaXQgbXVzdCBiZSB0aGlzIEZTTSBpbnN0YW5jZSAodGhpcyBpc24ndCBhIGJlaGF2aW9yYWwgRlNNKVxuXHRcdGlmICggdHlwZW9mIF9hcmdzWyAwIF0gPT09IFwib2JqZWN0XCIgJiYgISggXCJpbnB1dFR5cGVcIiBpbiBfYXJnc1sgMCBdICkgJiYgX2FyZ3NbIDAgXSAhPT0gdGhpcyApIHtcblx0XHRcdF9hcmdzLnNwbGljZSggMCwgMSwgdGhpcyApO1xuXHRcdH0gZWxzZSBpZiAoIHR5cGVvZiBfYXJnc1sgMCBdICE9PSBcIm9iamVjdFwiIHx8ICggdHlwZW9mIF9hcmdzWyAwIF0gPT09IFwib2JqZWN0XCIgJiYgKCBcImlucHV0VHlwZVwiIGluIF9hcmdzWyAwIF0gKSApICkge1xuXHRcdFx0X2FyZ3MudW5zaGlmdCggdGhpcyApO1xuXHRcdH1cblx0XHRyZXR1cm4gX2FyZ3M7XG5cdH0sXG5cblx0Z2V0SGFuZGxlckFyZ3M6IGZ1bmN0aW9uKCBhcmdzLCBpc0NhdGNoQWxsICkge1xuXHRcdC8vIGluZGV4IDAgaXMgdGhlIGNsaWVudCwgaW5kZXggMSBpcyBpbnB1dFR5cGVcblx0XHQvLyBpZiB3ZSdyZSBpbiBhIGNhdGNoLWFsbCBoYW5kbGVyLCBpbnB1dCB0eXBlIG5lZWRzIHRvIGJlIGluY2x1ZGVkIGluIHRoZSBhcmdzXG5cdFx0Ly8gaW5wdXRUeXBlIG1pZ2h0IGJlIGFuIG9iamVjdCwgc28gd2UgbmVlZCB0byBqdXN0IGdldCB0aGUgaW5wdXRUeXBlIHN0cmluZyBpZiBzb1xuXHRcdHZhciBfYXJncyA9IGFyZ3M7XG5cdFx0dmFyIGlucHV0ID0gX2FyZ3NbIDEgXTtcblx0XHRpZiAoIHR5cGVvZiBpbnB1dFR5cGUgPT09IFwib2JqZWN0XCIgKSB7XG5cdFx0XHRfYXJncy5zcGxpY2UoIDEsIDEsIGlucHV0LmlucHV0VHlwZSApO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNDYXRjaEFsbCA/XG5cdFx0XHRfYXJncy5zbGljZSggMSApIDpcblx0XHRcdF9hcmdzLnNsaWNlKCAyICk7XG5cdH0sXG5cblx0Z2V0U3lzdGVtSGFuZGxlckFyZ3M6IGZ1bmN0aW9uKCBhcmdzLCBjbGllbnQgKSB7XG5cdFx0cmV0dXJuIGFyZ3M7XG5cdH0sXG5cblx0Ly8gXCJjbGFzc2ljXCIgbWFjaGluYSBGU00gZG8gbm90IGVtaXQgdGhlIGNsaWVudCBwcm9wZXJ0eSBvbiBldmVudHMgKHdoaWNoIHdvdWxkIGJlIHRoZSBGU00gaXRzZWxmKVxuXHRidWlsZEV2ZW50UGF5bG9hZDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSB0aGlzLmVuc3VyZUNsaWVudEFyZyggdXRpbHMuZ2V0TGVha2xlc3NBcmdzKCBhcmd1bWVudHMgKSApO1xuXHRcdHZhciBkYXRhID0gYXJnc1sgMSBdO1xuXHRcdGlmICggXy5pc1BsYWluT2JqZWN0KCBkYXRhICkgKSB7XG5cdFx0XHRyZXR1cm4gXy5leHRlbmQoIGRhdGEsIHsgbmFtZXNwYWNlOiB0aGlzLm5hbWVzcGFjZSB9ICk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IGRhdGEgfHwgbnVsbCwgbmFtZXNwYWNlOiB0aGlzLm5hbWVzcGFjZSB9O1xuXHRcdH1cblx0fVxufTtcblxuXy5lYWNoKCBbXG5cdFwiaGFuZGxlXCIsXG5cdFwidHJhbnNpdGlvblwiLFxuXHRcImRlZmVyVW50aWxUcmFuc2l0aW9uXCIsXG5cdFwicHJvY2Vzc1F1ZXVlXCIsXG5cdFwiY2xlYXJRdWV1ZVwiXG5dLCBmdW5jdGlvbiggbWV0aG9kV2l0aENsaWVudEluamVjdGVkICkge1xuXHRGc21bIG1ldGhvZFdpdGhDbGllbnRJbmplY3RlZCBdID0gZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSB0aGlzLmVuc3VyZUNsaWVudEFyZyggdXRpbHMuZ2V0TGVha2xlc3NBcmdzKCBhcmd1bWVudHMgKSApO1xuXHRcdHJldHVybiBCZWhhdmlvcmFsRnNtLnByb3RvdHlwZVsgbWV0aG9kV2l0aENsaWVudEluamVjdGVkIF0uYXBwbHkoIHRoaXMsIGFyZ3MgKTtcblx0fTtcbn0gKTtcblxuRnNtID0gQmVoYXZpb3JhbEZzbS5leHRlbmQoIEZzbSApO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZzbTtcblxuXG5cbi8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV0VCUEFDSyBGT09URVJcbi8vIC4vc3JjL0ZzbS5qc1xuLy8gbW9kdWxlIGlkID0gNVxuLy8gbW9kdWxlIGNodW5rcyA9IDAiLCJ2YXIgXyA9IHJlcXVpcmUoIFwibG9kYXNoXCIgKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoIFwiLi91dGlsc1wiICk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoIFwiLi9lbWl0dGVyXCIgKTtcbnZhciB0b3BMZXZlbEVtaXR0ZXIgPSBlbWl0dGVyLmluc3RhbmNlO1xudmFyIGV2ZW50cyA9IHJlcXVpcmUoIFwiLi9ldmVudHNcIiApO1xuXG52YXIgTUFDSElOQV9QUk9QID0gXCJfX21hY2hpbmFfX1wiO1xuXG5mdW5jdGlvbiBCZWhhdmlvcmFsRnNtKCBvcHRpb25zICkge1xuXHRfLmV4dGVuZCggdGhpcywgb3B0aW9ucyApO1xuXHRfLmRlZmF1bHRzKCB0aGlzLCB1dGlscy5nZXREZWZhdWx0QmVoYXZpb3JhbE9wdGlvbnMoKSApO1xuXHR0aGlzLmluaXRpYWxpemUuYXBwbHkoIHRoaXMsIGFyZ3VtZW50cyApO1xuXHR0b3BMZXZlbEVtaXR0ZXIuZW1pdCggZXZlbnRzLk5FV19GU00sIHRoaXMgKTtcbn1cblxuXy5leHRlbmQoIEJlaGF2aW9yYWxGc20ucHJvdG90eXBlLCB7XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge30sXG5cblx0aW5pdENsaWVudDogZnVuY3Rpb24gaW5pdENsaWVudCggY2xpZW50ICkge1xuXHRcdHZhciBpbml0aWFsU3RhdGUgPSB0aGlzLmluaXRpYWxTdGF0ZTtcblx0XHRpZiAoICFpbml0aWFsU3RhdGUgKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoIFwiWW91IG11c3Qgc3BlY2lmeSBhbiBpbml0aWFsIHN0YXRlIGZvciB0aGlzIEZTTVwiICk7XG5cdFx0fVxuXHRcdGlmICggIXRoaXMuc3RhdGVzWyBpbml0aWFsU3RhdGUgXSApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvciggXCJUaGUgaW5pdGlhbCBzdGF0ZSBzcGVjaWZpZWQgZG9lcyBub3QgZXhpc3QgaW4gdGhlIHN0YXRlcyBvYmplY3QuXCIgKTtcblx0XHR9XG5cdFx0dGhpcy50cmFuc2l0aW9uKCBjbGllbnQsIGluaXRpYWxTdGF0ZSApO1xuXHR9LFxuXG5cdGNvbmZpZ0ZvclN0YXRlOiBmdW5jdGlvbiBjb25maWdGb3JTdGF0ZSggbmV3U3RhdGUgKSB7XG5cdFx0dmFyIG5ld1N0YXRlT2JqID0gdGhpcy5zdGF0ZXNbIG5ld1N0YXRlIF07XG5cdFx0dmFyIGNoaWxkO1xuXHRcdF8uZWFjaCggdGhpcy5oaWVyYXJjaHksIGZ1bmN0aW9uKCBjaGlsZExpc3RlbmVyLCBrZXkgKSB7XG5cdFx0XHRpZiAoIGNoaWxkTGlzdGVuZXIgJiYgdHlwZW9mIGNoaWxkTGlzdGVuZXIub2ZmID09PSBcImZ1bmN0aW9uXCIgKSB7XG5cdFx0XHRcdGNoaWxkTGlzdGVuZXIub2ZmKCk7XG5cdFx0XHR9XG5cdFx0fSApO1xuXG5cdFx0aWYgKCBuZXdTdGF0ZU9iai5fY2hpbGQgKSB7XG5cdFx0XHRuZXdTdGF0ZU9iai5fY2hpbGQgPSB1dGlscy5nZXRDaGlsZEZzbUluc3RhbmNlKCBuZXdTdGF0ZU9iai5fY2hpbGQgKTtcblx0XHRcdGNoaWxkID0gbmV3U3RhdGVPYmouX2NoaWxkICYmIG5ld1N0YXRlT2JqLl9jaGlsZC5pbnN0YW5jZTtcblx0XHRcdHRoaXMuaGllcmFyY2h5WyBjaGlsZC5uYW1lc3BhY2UgXSA9IHV0aWxzLmxpc3RlblRvQ2hpbGQoIHRoaXMsIGNoaWxkICk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGVuc3VyZUNsaWVudE1ldGE6IGZ1bmN0aW9uIGVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApIHtcblx0XHRpZiAoIHR5cGVvZiBjbGllbnQgIT09IFwib2JqZWN0XCIgKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoIFwiQW4gRlNNIGNsaWVudCBtdXN0IGJlIGFuIG9iamVjdC5cIiApO1xuXHRcdH1cblx0XHRjbGllbnRbIE1BQ0hJTkFfUFJPUCBdID0gY2xpZW50WyBNQUNISU5BX1BST1AgXSB8fCB7fTtcblx0XHRpZiAoICFjbGllbnRbIE1BQ0hJTkFfUFJPUCBdWyB0aGlzLm5hbWVzcGFjZSBdICkge1xuXHRcdFx0Y2xpZW50WyBNQUNISU5BX1BST1AgXVsgdGhpcy5uYW1lc3BhY2UgXSA9IF8uY2xvbmVEZWVwKCB1dGlscy5nZXREZWZhdWx0Q2xpZW50TWV0YSgpICk7XG5cdFx0XHR0aGlzLmluaXRDbGllbnQoIGNsaWVudCApO1xuXHRcdH1cblx0XHRyZXR1cm4gY2xpZW50WyBNQUNISU5BX1BST1AgXVsgdGhpcy5uYW1lc3BhY2UgXTtcblx0fSxcblxuXHRidWlsZEV2ZW50UGF5bG9hZDogZnVuY3Rpb24oIGNsaWVudCwgZGF0YSApIHtcblx0XHRpZiAoIF8uaXNQbGFpbk9iamVjdCggZGF0YSApICkge1xuXHRcdFx0cmV0dXJuIF8uZXh0ZW5kKCBkYXRhLCB7IGNsaWVudDogY2xpZW50LCBuYW1lc3BhY2U6IHRoaXMubmFtZXNwYWNlIH0gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgY2xpZW50OiBjbGllbnQsIGRhdGE6IGRhdGEgfHwgbnVsbCwgbmFtZXNwYWNlOiB0aGlzLm5hbWVzcGFjZSB9O1xuXHRcdH1cblx0fSxcblxuXHRnZXRIYW5kbGVyQXJnczogZnVuY3Rpb24oIGFyZ3MsIGlzQ2F0Y2hBbGwgKSB7XG5cdFx0Ly8gaW5kZXggMCBpcyB0aGUgY2xpZW50LCBpbmRleCAxIGlzIGlucHV0VHlwZVxuXHRcdC8vIGlmIHdlJ3JlIGluIGEgY2F0Y2gtYWxsIGhhbmRsZXIsIGlucHV0IHR5cGUgbmVlZHMgdG8gYmUgaW5jbHVkZWQgaW4gdGhlIGFyZ3Ncblx0XHQvLyBpbnB1dFR5cGUgbWlnaHQgYmUgYW4gb2JqZWN0LCBzbyB3ZSBuZWVkIHRvIGp1c3QgZ2V0IHRoZSBpbnB1dFR5cGUgc3RyaW5nIGlmIHNvXG5cdFx0dmFyIF9hcmdzID0gYXJncy5zbGljZSggMCApO1xuXHRcdHZhciBpbnB1dCA9IF9hcmdzWyAxIF07XG5cdFx0aWYgKCB0eXBlb2YgaW5wdXQgPT09IFwib2JqZWN0XCIgKSB7XG5cdFx0XHRfYXJncy5zcGxpY2UoIDEsIDEsIGlucHV0LmlucHV0VHlwZSApO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNDYXRjaEFsbCA/XG5cdFx0XHRfYXJncyA6XG5cdFx0XHRbIF9hcmdzWyAwIF0gXS5jb25jYXQoIF9hcmdzLnNsaWNlKCAyICkgKTtcblx0fSxcblxuXHRnZXRTeXN0ZW1IYW5kbGVyQXJnczogZnVuY3Rpb24oIGFyZ3MsIGNsaWVudCApIHtcblx0XHRyZXR1cm4gWyBjbGllbnQgXS5jb25jYXQoIGFyZ3MgKTtcblx0fSxcblxuXHRoYW5kbGU6IGZ1bmN0aW9uKCBjbGllbnQsIGlucHV0ICkge1xuXHRcdHZhciBpbnB1dERlZiA9IGlucHV0O1xuXHRcdGlmICggdHlwZW9mIGlucHV0ID09PSBcInVuZGVmaW5lZFwiICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIlRoZSBpbnB1dCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIEZTTSdzIGhhbmRsZSBtZXRob2QgaXMgdW5kZWZpbmVkLiBEaWQgeW91IGZvcmdldCB0byBwYXNzIHRoZSBpbnB1dCBuYW1lP1wiICk7XG5cdFx0fVxuXHRcdGlmICggdHlwZW9mIGlucHV0ID09PSBcInN0cmluZ1wiICkge1xuXHRcdFx0aW5wdXREZWYgPSB7IGlucHV0VHlwZTogaW5wdXQsIGRlbGVnYXRlZDogZmFsc2UsIHRpY2tldDogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdHZhciBjbGllbnRNZXRhID0gdGhpcy5lbnN1cmVDbGllbnRNZXRhKCBjbGllbnQgKTtcblx0XHR2YXIgYXJncyA9IHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICk7XG5cdFx0aWYgKCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIgKSB7XG5cdFx0XHRhcmdzLnNwbGljZSggMSwgMSwgaW5wdXREZWYgKTtcblx0XHR9XG5cdFx0Y2xpZW50TWV0YS5jdXJyZW50QWN0aW9uQXJncyA9IGFyZ3Muc2xpY2UoIDEgKTtcblx0XHR2YXIgY3VycmVudFN0YXRlID0gY2xpZW50TWV0YS5zdGF0ZTtcblx0XHR2YXIgc3RhdGVPYmogPSB0aGlzLnN0YXRlc1sgY3VycmVudFN0YXRlIF07XG5cdFx0dmFyIGhhbmRsZXJOYW1lO1xuXHRcdHZhciBoYW5kbGVyO1xuXHRcdHZhciBpc0NhdGNoQWxsID0gZmFsc2U7XG5cdFx0dmFyIGNoaWxkO1xuXHRcdHZhciByZXN1bHQ7XG5cdFx0dmFyIGFjdGlvbjtcblx0XHRpZiAoICFjbGllbnRNZXRhLmluRXhpdEhhbmRsZXIgKSB7XG5cdFx0XHRjaGlsZCA9IHRoaXMuY29uZmlnRm9yU3RhdGUoIGN1cnJlbnRTdGF0ZSApO1xuXHRcdFx0aWYgKCBjaGlsZCAmJiAhdGhpcy5wZW5kaW5nRGVsZWdhdGlvbnNbIGlucHV0RGVmLnRpY2tldCBdICYmICFpbnB1dERlZi5idWJibGluZyApIHtcblx0XHRcdFx0aW5wdXREZWYudGlja2V0ID0gKCBpbnB1dERlZi50aWNrZXQgfHwgdXRpbHMuY3JlYXRlVVVJRCgpICk7XG5cdFx0XHRcdGlucHV0RGVmLmRlbGVnYXRlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMucGVuZGluZ0RlbGVnYXRpb25zWyBpbnB1dERlZi50aWNrZXQgXSA9IHsgZGVsZWdhdGVkVG86IGNoaWxkLm5hbWVzcGFjZSB9O1xuXHRcdFx0XHQvLyBXQVJOSU5HIC0gcmV0dXJuaW5nIGEgdmFsdWUgZnJvbSBgaGFuZGxlYCBvbiBjaGlsZCBGU01zIGlzIG5vdCByZWFsbHkgc3VwcG9ydGVkLlxuXHRcdFx0XHQvLyBJZiB5b3UgbmVlZCB0byByZXR1cm4gdmFsdWVzIGZyb20gY2hpbGQgRlNNIGlucHV0IGhhbmRsZXJzLCB1c2UgZXZlbnRzIGluc3RlYWQuXG5cdFx0XHRcdHJlc3VsdCA9IGNoaWxkLmhhbmRsZS5hcHBseSggY2hpbGQsIGFyZ3MgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICggaW5wdXREZWYudGlja2V0ICYmIHRoaXMucGVuZGluZ0RlbGVnYXRpb25zWyBpbnB1dERlZi50aWNrZXQgXSApIHtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5wZW5kaW5nRGVsZWdhdGlvbnNbIGlucHV0RGVmLnRpY2tldCBdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhbmRsZXJOYW1lID0gc3RhdGVPYmpbIGlucHV0RGVmLmlucHV0VHlwZSBdID8gaW5wdXREZWYuaW5wdXRUeXBlIDogXCIqXCI7XG5cdFx0XHRcdGlzQ2F0Y2hBbGwgPSAoIGhhbmRsZXJOYW1lID09PSBcIipcIiApO1xuXHRcdFx0XHRoYW5kbGVyID0gKCBzdGF0ZU9ialsgaGFuZGxlck5hbWUgXSB8fCB0aGlzWyBoYW5kbGVyTmFtZSBdICkgfHwgdGhpc1sgXCIqXCIgXTtcblx0XHRcdFx0YWN0aW9uID0gY2xpZW50TWV0YS5zdGF0ZSArIFwiLlwiICsgaGFuZGxlck5hbWU7XG5cdFx0XHRcdGNsaWVudE1ldGEuY3VycmVudEFjdGlvbiA9IGFjdGlvbjtcblx0XHRcdFx0dmFyIGV2ZW50UGF5bG9hZCA9IHRoaXMuYnVpbGRFdmVudFBheWxvYWQoXG5cdFx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHRcdHsgaW5wdXRUeXBlOiBpbnB1dERlZi5pbnB1dFR5cGUsIGRlbGVnYXRlZDogaW5wdXREZWYuZGVsZWdhdGVkLCB0aWNrZXQ6IGlucHV0RGVmLnRpY2tldCB9XG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmICggIWhhbmRsZXIgKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCBldmVudHMuTk9fSEFORExFUiwgXy5leHRlbmQoIHsgYXJnczogYXJncyB9LCBldmVudFBheWxvYWQgKSApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZW1pdCggZXZlbnRzLkhBTkRMSU5HLCBldmVudFBheWxvYWQgKTtcblx0XHRcdFx0XHRpZiAoIHR5cGVvZiBoYW5kbGVyID09PSBcImZ1bmN0aW9uXCIgKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBoYW5kbGVyLmFwcGx5KCB0aGlzLCB0aGlzLmdldEhhbmRsZXJBcmdzKCBhcmdzLCBpc0NhdGNoQWxsICkgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gaGFuZGxlcjtcblx0XHRcdFx0XHRcdHRoaXMudHJhbnNpdGlvbiggY2xpZW50LCBoYW5kbGVyICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuZW1pdCggZXZlbnRzLkhBTkRMRUQsIGV2ZW50UGF5bG9hZCApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNsaWVudE1ldGEucHJpb3JBY3Rpb24gPSBjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb247XG5cdFx0XHRcdGNsaWVudE1ldGEuY3VycmVudEFjdGlvbiA9IFwiXCI7XG5cdFx0XHRcdGNsaWVudE1ldGEuY3VycmVudEFjdGlvbkFyZ3MgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0sXG5cblx0dHJhbnNpdGlvbjogZnVuY3Rpb24oIGNsaWVudCwgbmV3U3RhdGUgKSB7XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdHZhciBjdXJTdGF0ZSA9IGNsaWVudE1ldGEuc3RhdGU7XG5cdFx0dmFyIGN1clN0YXRlT2JqID0gdGhpcy5zdGF0ZXNbIGN1clN0YXRlIF07XG5cdFx0dmFyIG5ld1N0YXRlT2JqID0gdGhpcy5zdGF0ZXNbIG5ld1N0YXRlIF07XG5cdFx0dmFyIGNoaWxkO1xuXHRcdHZhciBhcmdzID0gdXRpbHMuZ2V0TGVha2xlc3NBcmdzKCBhcmd1bWVudHMgKS5zbGljZSggMiApO1xuXHRcdGlmICggIWNsaWVudE1ldGEuaW5FeGl0SGFuZGxlciAmJiBuZXdTdGF0ZSAhPT0gY3VyU3RhdGUgKSB7XG5cdFx0XHRpZiAoIG5ld1N0YXRlT2JqICkge1xuXHRcdFx0XHRjaGlsZCA9IHRoaXMuY29uZmlnRm9yU3RhdGUoIG5ld1N0YXRlICk7XG5cdFx0XHRcdGlmICggY3VyU3RhdGVPYmogJiYgY3VyU3RhdGVPYmouX29uRXhpdCApIHtcblx0XHRcdFx0XHRjbGllbnRNZXRhLmluRXhpdEhhbmRsZXIgPSB0cnVlO1xuXHRcdFx0XHRcdGN1clN0YXRlT2JqLl9vbkV4aXQuY2FsbCggdGhpcywgY2xpZW50ICk7XG5cdFx0XHRcdFx0Y2xpZW50TWV0YS5pbkV4aXRIYW5kbGVyID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xpZW50TWV0YS50YXJnZXRSZXBsYXlTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0XHRjbGllbnRNZXRhLnByaW9yU3RhdGUgPSBjdXJTdGF0ZTtcblx0XHRcdFx0Y2xpZW50TWV0YS5zdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0XHR2YXIgZXZlbnRQYXlsb2FkID0gdGhpcy5idWlsZEV2ZW50UGF5bG9hZCggY2xpZW50LCB7XG5cdFx0XHRcdFx0ZnJvbVN0YXRlOiBjbGllbnRNZXRhLnByaW9yU3RhdGUsXG5cdFx0XHRcdFx0YWN0aW9uOiBjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb24sXG5cdFx0XHRcdFx0dG9TdGF0ZTogbmV3U3RhdGVcblx0XHRcdFx0fSApO1xuXHRcdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5UUkFOU0lUSU9OLCBldmVudFBheWxvYWQgKTtcblx0XHRcdFx0aWYgKCBuZXdTdGF0ZU9iai5fb25FbnRlciApIHtcblx0XHRcdFx0XHRuZXdTdGF0ZU9iai5fb25FbnRlci5hcHBseSggdGhpcywgdGhpcy5nZXRTeXN0ZW1IYW5kbGVyQXJncyggYXJncywgY2xpZW50ICkgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5UUkFOU0lUSU9ORUQsIGV2ZW50UGF5bG9hZCApO1xuXHRcdFx0XHRpZiAoIGNoaWxkICkge1xuXHRcdFx0XHRcdGNoaWxkLmhhbmRsZSggY2xpZW50LCBcIl9yZXNldFwiICk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIGNsaWVudE1ldGEudGFyZ2V0UmVwbGF5U3RhdGUgPT09IG5ld1N0YXRlICkge1xuXHRcdFx0XHRcdHRoaXMucHJvY2Vzc1F1ZXVlKCBjbGllbnQsIGV2ZW50cy5ORVhUX1RSQU5TSVRJT04gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5JTlZBTElEX1NUQVRFLCB0aGlzLmJ1aWxkRXZlbnRQYXlsb2FkKCBjbGllbnQsIHtcblx0XHRcdFx0c3RhdGU6IGNsaWVudE1ldGEuc3RhdGUsXG5cdFx0XHRcdGF0dGVtcHRlZFN0YXRlOiBuZXdTdGF0ZVxuXHRcdFx0fSApICk7XG5cdFx0fVxuXHR9LFxuXG5cdGRlZmVyVW50aWxUcmFuc2l0aW9uOiBmdW5jdGlvbiggY2xpZW50LCBzdGF0ZU5hbWUgKSB7XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdGlmICggY2xpZW50TWV0YS5jdXJyZW50QWN0aW9uQXJncyApIHtcblx0XHRcdHZhciBxdWV1ZWQgPSB7XG5cdFx0XHRcdHR5cGU6IGV2ZW50cy5ORVhUX1RSQU5TSVRJT04sXG5cdFx0XHRcdHVudGlsU3RhdGU6IHN0YXRlTmFtZSxcblx0XHRcdFx0YXJnczogY2xpZW50TWV0YS5jdXJyZW50QWN0aW9uQXJnc1xuXHRcdFx0fTtcblx0XHRcdGNsaWVudE1ldGEuaW5wdXRRdWV1ZS5wdXNoKCBxdWV1ZWQgKTtcblx0XHRcdHZhciBldmVudFBheWxvYWQgPSB0aGlzLmJ1aWxkRXZlbnRQYXlsb2FkKCBjbGllbnQsIHtcblx0XHRcdFx0c3RhdGU6IGNsaWVudE1ldGEuc3RhdGUsXG5cdFx0XHRcdHF1ZXVlZEFyZ3M6IHF1ZXVlZFxuXHRcdFx0fSApO1xuXHRcdFx0dGhpcy5lbWl0KCBldmVudHMuREVGRVJSRUQsIGV2ZW50UGF5bG9hZCApO1xuXHRcdH1cblx0fSxcblxuXHRkZWZlckFuZFRyYW5zaXRpb246IGZ1bmN0aW9uKCBjbGllbnQsIHN0YXRlTmFtZSApIHtcblx0XHR0aGlzLmRlZmVyVW50aWxUcmFuc2l0aW9uKCBjbGllbnQsIHN0YXRlTmFtZSApO1xuXHRcdHRoaXMudHJhbnNpdGlvbiggY2xpZW50LCBzdGF0ZU5hbWUgKTtcblx0fSxcblxuXHRwcm9jZXNzUXVldWU6IGZ1bmN0aW9uKCBjbGllbnQgKSB7XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdHZhciBmaWx0ZXJGbiA9IGZ1bmN0aW9uKCBpdGVtICkge1xuXHRcdFx0cmV0dXJuICggKCAhaXRlbS51bnRpbFN0YXRlICkgfHwgKCBpdGVtLnVudGlsU3RhdGUgPT09IGNsaWVudE1ldGEuc3RhdGUgKSApO1xuXHRcdH07XG5cdFx0dmFyIHRvUHJvY2VzcyA9IF8uZmlsdGVyKCBjbGllbnRNZXRhLmlucHV0UXVldWUsIGZpbHRlckZuICk7XG5cdFx0Y2xpZW50TWV0YS5pbnB1dFF1ZXVlID0gXy5kaWZmZXJlbmNlKCBjbGllbnRNZXRhLmlucHV0UXVldWUsIHRvUHJvY2VzcyApO1xuXHRcdF8uZWFjaCggdG9Qcm9jZXNzLCBmdW5jdGlvbiggaXRlbSApIHtcblx0XHRcdHRoaXMuaGFuZGxlLmFwcGx5KCB0aGlzLCBbIGNsaWVudCBdLmNvbmNhdCggaXRlbS5hcmdzICkgKTtcblx0XHR9LmJpbmQoIHRoaXMgKSApO1xuXHR9LFxuXG5cdGNsZWFyUXVldWU6IGZ1bmN0aW9uKCBjbGllbnQsIG5hbWUgKSB7XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdGlmICggIW5hbWUgKSB7XG5cdFx0XHRjbGllbnRNZXRhLmlucHV0UXVldWUgPSBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIGZpbHRlciA9IGZ1bmN0aW9uKCBldm50ICkge1xuXHRcdFx0XHRyZXR1cm4gKCBuYW1lID8gZXZudC51bnRpbFN0YXRlICE9PSBuYW1lIDogdHJ1ZSApO1xuXHRcdFx0fTtcblx0XHRcdGNsaWVudE1ldGEuaW5wdXRRdWV1ZSA9IF8uZmlsdGVyKCBjbGllbnRNZXRhLmlucHV0UXVldWUsIGZpbHRlciApO1xuXHRcdH1cblx0fSxcblxuXHRjb21wb3NpdGVTdGF0ZTogZnVuY3Rpb24oIGNsaWVudCApIHtcblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0dmFyIHN0YXRlID0gY2xpZW50TWV0YS5zdGF0ZTtcblx0XHR2YXIgY2hpbGQgPSB0aGlzLnN0YXRlc1tzdGF0ZV0uX2NoaWxkICYmIHRoaXMuc3RhdGVzW3N0YXRlXS5fY2hpbGQuaW5zdGFuY2U7XG5cdFx0aWYgKCBjaGlsZCApIHtcblx0XHRcdHN0YXRlICs9IFwiLlwiICsgY2hpbGQuY29tcG9zaXRlU3RhdGUoIGNsaWVudCApO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cbn0sIGVtaXR0ZXIuZ2V0SW5zdGFuY2UoKSApO1xuXG5CZWhhdmlvcmFsRnNtLmV4dGVuZCA9IHV0aWxzLmV4dGVuZDtcblxubW9kdWxlLmV4cG9ydHMgPSBCZWhhdmlvcmFsRnNtO1xuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXRUJQQUNLIEZPT1RFUlxuLy8gLi9zcmMvQmVoYXZpb3JhbEZzbS5qc1xuLy8gbW9kdWxlIGlkID0gNlxuLy8gbW9kdWxlIGNodW5rcyA9IDAiXSwic291cmNlUm9vdCI6IiJ9