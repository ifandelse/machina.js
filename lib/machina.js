/*!
 *  * machina - A library for creating powerful and flexible finite state machines. Loosely inspired by Erlang/OTP's gen_fsm behavior.
 *  * Author: Jim Cowart (http://ifandelse.com)
 *  * Version: v3.0.0
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
				childFsmDefinition.instance = childFsmDefinition.factory();
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
			var stateList = _.isArray( stateName ) ? stateName : ( stateName ? [ stateName ] : undefined );
			var prom = null;
			if ( clientMeta.currentActionArgs ) {
				var addToQueue = ( function( callback ) {
					var queued = {
						type: events.NEXT_TRANSITION,
						untilState: stateList,
						args: clientMeta.currentActionArgs
					};
					if ( callback ) {
						queued.callback = callback;
					}
					clientMeta.inputQueue.push( queued );
	
					var eventPayload = this.buildEventPayload( client, {
						state: clientMeta.state,
						queuedArgs: queued
					} );
					this.emit( events.DEFERRED, eventPayload );
				} ).bind( this );
				if ( Promise ) {
					prom = new Promise( function( resolve ) {
						addToQueue( resolve );
					} );
				} else {
					addToQueue();
				}
			}
	
			return prom;
		},
	
		deferAndTransition: function( client, stateName ) {
			var prom = this.deferUntilTransition( client, stateName );
			this.transition( client, stateName );
			return prom;
		},
	
		processQueue: function( client ) {
			var clientMeta = this.ensureClientMeta( client );
			var filterFn = function( item ) {
				return ( ( !item.untilState ) || ( _.includes( item.untilState, clientMeta.state ) ) );
			};
			var toProcess = _.filter( clientMeta.inputQueue, filterFn );
			clientMeta.inputQueue = _.difference( clientMeta.inputQueue, toProcess );
			_.each( toProcess, function( item ) {
				var value = this.handle.apply( this, [ client ].concat( item.args ) );
				if ( item.callback ) {
					item.callback( value );
				}
			}.bind( this ) );
		},
	
		clearQueue: function( client, name ) {
			var clientMeta = this.ensureClientMeta( client );
			if ( !name ) {
				clientMeta.inputQueue = [];
			} else {
				// first pass we remove the target state from any `untilState` array
				_.each( clientMeta.inputQueue, function( item ) {
					item.untilState = _.without( item.untilState, name );
				} );
				// second pass we clear out deferred events with empty untilState arrays
				var filter = function( evnt ) {
					return evnt.untilState.length !== 0;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay91bml2ZXJzYWxNb2R1bGVEZWZpbml0aW9uIiwid2VicGFjazovLy93ZWJwYWNrL2Jvb3RzdHJhcCBiZDZkNzRlN2VhYmRiNmNlYzczNyIsIndlYnBhY2s6Ly8vLi9zcmMvbWFjaGluYS5qcyIsIndlYnBhY2s6Ly8vZXh0ZXJuYWwge1wicm9vdFwiOlwiX1wiLFwiY29tbW9uanNcIjpcImxvZGFzaFwiLFwiY29tbW9uanMyXCI6XCJsb2Rhc2hcIixcImFtZFwiOlwibG9kYXNoXCJ9Iiwid2VicGFjazovLy8uL3NyYy9lbWl0dGVyLmpzIiwid2VicGFjazovLy8uL3NyYy91dGlscy5qcyIsIndlYnBhY2s6Ly8vLi9zcmMvZXZlbnRzLmpzIiwid2VicGFjazovLy8uL3NyYy9Gc20uanMiLCJ3ZWJwYWNrOi8vLy4vc3JjL0JlaGF2aW9yYWxGc20uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUM7QUFDRCxPO0FDVkE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsdUJBQWU7QUFDZjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7Ozs7OztBQ3RDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBQzs7Ozs7OztBQ1ZELGdEOzs7Ozs7QUNBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFNO0FBQ047QUFDQTtBQUNBLFFBQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU07QUFD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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSTtBQUNKO0FBQ0EsR0FBRTs7QUFFRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsTUFBSztBQUNMO0FBQ0EsS0FBSTtBQUNKO0FBQ0E7QUFDQTtBQUNBLE1BQUs7QUFDTCxLQUFJO0FBQ0o7QUFDQTtBQUNBOztBQUVBO0FBQ0EsR0FBRTs7QUFFRjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBRztBQUNILEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFHO0FBQ0g7QUFDQTtBQUNBO0FBQ0EsS0FBSTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBQzs7QUFFRDs7QUFFQSIsImZpbGUiOiJtYWNoaW5hLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIHdlYnBhY2tVbml2ZXJzYWxNb2R1bGVEZWZpbml0aW9uKHJvb3QsIGZhY3RvcnkpIHtcblx0aWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKVxuXHRcdG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKFwibG9kYXNoXCIpKTtcblx0ZWxzZSBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpXG5cdFx0ZGVmaW5lKFtcImxvZGFzaFwiXSwgZmFjdG9yeSk7XG5cdGVsc2UgaWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKVxuXHRcdGV4cG9ydHNbXCJtYWNoaW5hXCJdID0gZmFjdG9yeShyZXF1aXJlKFwibG9kYXNoXCIpKTtcblx0ZWxzZVxuXHRcdHJvb3RbXCJtYWNoaW5hXCJdID0gZmFjdG9yeShyb290W1wiX1wiXSk7XG59KSh0aGlzLCBmdW5jdGlvbihfX1dFQlBBQ0tfRVhURVJOQUxfTU9EVUxFXzFfXykge1xucmV0dXJuIFxuXG5cbi8vIFdFQlBBQ0sgRk9PVEVSIC8vXG4vLyB3ZWJwYWNrL3VuaXZlcnNhbE1vZHVsZURlZmluaXRpb24iLCIgXHQvLyBUaGUgbW9kdWxlIGNhY2hlXG4gXHR2YXIgaW5zdGFsbGVkTW9kdWxlcyA9IHt9O1xuXG4gXHQvLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuIFx0ZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXG4gXHRcdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuIFx0XHRpZihpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSlcbiBcdFx0XHRyZXR1cm4gaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0uZXhwb3J0cztcblxuIFx0XHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuIFx0XHR2YXIgbW9kdWxlID0gaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0gPSB7XG4gXHRcdFx0ZXhwb3J0czoge30sXG4gXHRcdFx0aWQ6IG1vZHVsZUlkLFxuIFx0XHRcdGxvYWRlZDogZmFsc2VcbiBcdFx0fTtcblxuIFx0XHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cbiBcdFx0bW9kdWxlc1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cbiBcdFx0Ly8gRmxhZyB0aGUgbW9kdWxlIGFzIGxvYWRlZFxuIFx0XHRtb2R1bGUubG9hZGVkID0gdHJ1ZTtcblxuIFx0XHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuIFx0XHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG4gXHR9XG5cblxuIFx0Ly8gZXhwb3NlIHRoZSBtb2R1bGVzIG9iamVjdCAoX193ZWJwYWNrX21vZHVsZXNfXylcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubSA9IG1vZHVsZXM7XG5cbiBcdC8vIGV4cG9zZSB0aGUgbW9kdWxlIGNhY2hlXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmMgPSBpbnN0YWxsZWRNb2R1bGVzO1xuXG4gXHQvLyBfX3dlYnBhY2tfcHVibGljX3BhdGhfX1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5wID0gXCJcIjtcblxuIFx0Ly8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4gXHRyZXR1cm4gX193ZWJwYWNrX3JlcXVpcmVfXygwKTtcblxuXG5cbi8vIFdFQlBBQ0sgRk9PVEVSIC8vXG4vLyB3ZWJwYWNrL2Jvb3RzdHJhcCBiZDZkNzRlN2VhYmRiNmNlYzczNyIsInZhciBfID0gcmVxdWlyZSggXCJsb2Rhc2hcIiApO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCBcIi4vZW1pdHRlclwiICk7XG5cbm1vZHVsZS5leHBvcnRzID0gXy5tZXJnZSggZW1pdHRlci5pbnN0YW5jZSwge1xuXHRGc206IHJlcXVpcmUoIFwiLi9Gc21cIiApLFxuXHRCZWhhdmlvcmFsRnNtOiByZXF1aXJlKCBcIi4vQmVoYXZpb3JhbEZzbVwiICksXG5cdHV0aWxzOiByZXF1aXJlKCBcIi4vdXRpbHNcIiApLFxuXHRldmVudExpc3RlbmVyczoge1xuXHRcdG5ld0ZzbTogW11cblx0fVxufSApO1xuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXRUJQQUNLIEZPT1RFUlxuLy8gLi9zcmMvbWFjaGluYS5qc1xuLy8gbW9kdWxlIGlkID0gMFxuLy8gbW9kdWxlIGNodW5rcyA9IDAiLCJtb2R1bGUuZXhwb3J0cyA9IF9fV0VCUEFDS19FWFRFUk5BTF9NT0RVTEVfMV9fO1xuXG5cbi8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV0VCUEFDSyBGT09URVJcbi8vIGV4dGVybmFsIHtcInJvb3RcIjpcIl9cIixcImNvbW1vbmpzXCI6XCJsb2Rhc2hcIixcImNvbW1vbmpzMlwiOlwibG9kYXNoXCIsXCJhbWRcIjpcImxvZGFzaFwifVxuLy8gbW9kdWxlIGlkID0gMVxuLy8gbW9kdWxlIGNodW5rcyA9IDAiLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCBcIi4vdXRpbHNcIiApO1xudmFyIF8gPSByZXF1aXJlKCBcImxvZGFzaFwiICk7XG5cbmZ1bmN0aW9uIGdldEluc3RhbmNlKCkge1xuXHRyZXR1cm4ge1xuXHRcdGVtaXQ6IGZ1bmN0aW9uKCBldmVudE5hbWUgKSB7XG5cdFx0XHR2YXIgYXJncyA9IHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICk7XG5cdFx0XHRpZiAoIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIFwiKlwiIF0gKSB7XG5cdFx0XHRcdF8uZWFjaCggdGhpcy5ldmVudExpc3RlbmVyc1sgXCIqXCIgXSwgZnVuY3Rpb24oIGNhbGxiYWNrICkge1xuXHRcdFx0XHRcdGlmICggIXRoaXMudXNlU2FmZUVtaXQgKSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSggdGhpcywgYXJncyApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSggdGhpcywgYXJncyApO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoIGV4Y2VwdGlvbiApIHtcblx0XHRcdFx0XHRcdFx0LyogaXN0YW5idWwgaWdub3JlIGVsc2UgICovXG5cdFx0XHRcdFx0XHRcdGlmICggY29uc29sZSAmJiB0eXBlb2YgY29uc29sZS5sb2cgIT09IFwidW5kZWZpbmVkXCIgKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coIGV4Y2VwdGlvbi5zdGFjayApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0aGlzICk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdICkge1xuXHRcdFx0XHRfLmVhY2goIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdLCBmdW5jdGlvbiggY2FsbGJhY2sgKSB7XG5cdFx0XHRcdFx0aWYgKCAhdGhpcy51c2VTYWZlRW1pdCApIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrLmFwcGx5KCB0aGlzLCBhcmdzLnNsaWNlKCAxICkgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y2FsbGJhY2suYXBwbHkoIHRoaXMsIGFyZ3Muc2xpY2UoIDEgKSApO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoIGV4Y2VwdGlvbiApIHtcblx0XHRcdFx0XHRcdFx0LyogaXN0YW5idWwgaWdub3JlIGVsc2UgICovXG5cdFx0XHRcdFx0XHRcdGlmICggY29uc29sZSAmJiB0eXBlb2YgY29uc29sZS5sb2cgIT09IFwidW5kZWZpbmVkXCIgKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coIGV4Y2VwdGlvbi5zdGFjayApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0aGlzICk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdG9uOiBmdW5jdGlvbiggZXZlbnROYW1lLCBjYWxsYmFjayApIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNlbGYuZXZlbnRMaXN0ZW5lcnMgPSBzZWxmLmV2ZW50TGlzdGVuZXJzIHx8IHsgXCIqXCI6IFtdIH07XG5cdFx0XHRpZiAoICFzZWxmLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSApIHtcblx0XHRcdFx0c2VsZi5ldmVudExpc3RlbmVyc1sgZXZlbnROYW1lIF0gPSBbXTtcblx0XHRcdH1cblx0XHRcdHNlbGYuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdLnB1c2goIGNhbGxiYWNrICk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRldmVudE5hbWU6IGV2ZW50TmFtZSxcblx0XHRcdFx0Y2FsbGJhY2s6IGNhbGxiYWNrLFxuXHRcdFx0XHRvZmY6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHNlbGYub2ZmKCBldmVudE5hbWUsIGNhbGxiYWNrICk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSxcblxuXHRcdG9mZjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgY2FsbGJhY2sgKSB7XG5cdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzID0gdGhpcy5ldmVudExpc3RlbmVycyB8fCB7IFwiKlwiOiBbXSB9O1xuXHRcdFx0aWYgKCAhZXZlbnROYW1lICkge1xuXHRcdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzID0ge307XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIGNhbGxiYWNrICkge1xuXHRcdFx0XHRcdHRoaXMuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdID0gXy53aXRob3V0KCB0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSwgY2FsbGJhY2sgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0Z2V0SW5zdGFuY2U6IGdldEluc3RhbmNlLFxuXHRpbnN0YW5jZTogZ2V0SW5zdGFuY2UoKVxufTtcblxuXG5cbi8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV0VCUEFDSyBGT09URVJcbi8vIC4vc3JjL2VtaXR0ZXIuanNcbi8vIG1vZHVsZSBpZCA9IDJcbi8vIG1vZHVsZSBjaHVua3MgPSAwIiwidmFyIHNsaWNlID0gW10uc2xpY2U7XG52YXIgZXZlbnRzID0gcmVxdWlyZSggXCIuL2V2ZW50cy5qc1wiICk7XG52YXIgXyA9IHJlcXVpcmUoIFwibG9kYXNoXCIgKTtcblxudmFyIG1ha2VGc21OYW1lc3BhY2UgPSAoIGZ1bmN0aW9uKCkge1xuXHR2YXIgbWFjaGluYUNvdW50ID0gMDtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiBcImZzbS5cIiArIG1hY2hpbmFDb3VudCsrO1xuXHR9O1xufSApKCk7XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRCZWhhdmlvcmFsT3B0aW9ucygpIHtcblx0cmV0dXJuIHtcblx0XHRpbml0aWFsU3RhdGU6IFwidW5pbml0aWFsaXplZFwiLFxuXHRcdGV2ZW50TGlzdGVuZXJzOiB7XG5cdFx0XHRcIipcIjogW11cblx0XHR9LFxuXHRcdHN0YXRlczoge30sXG5cdFx0bmFtZXNwYWNlOiBtYWtlRnNtTmFtZXNwYWNlKCksXG5cdFx0dXNlU2FmZUVtaXQ6IGZhbHNlLFxuXHRcdGhpZXJhcmNoeToge30sXG5cdFx0cGVuZGluZ0RlbGVnYXRpb25zOiB7fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXREZWZhdWx0Q2xpZW50TWV0YSgpIHtcblx0cmV0dXJuIHtcblx0XHRpbnB1dFF1ZXVlOiBbXSxcblx0XHR0YXJnZXRSZXBsYXlTdGF0ZTogXCJcIixcblx0XHRzdGF0ZTogdW5kZWZpbmVkLFxuXHRcdHByaW9yU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRwcmlvckFjdGlvbjogXCJcIixcblx0XHRjdXJyZW50QWN0aW9uOiBcIlwiLFxuXHRcdGN1cnJlbnRBY3Rpb25BcmdzOiB1bmRlZmluZWQsXG5cdFx0aW5FeGl0SGFuZGxlcjogZmFsc2Vcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0TGVha2xlc3NBcmdzKCBhcmdzLCBzdGFydElkeCApIHtcblx0dmFyIHJlc3VsdCA9IFtdO1xuXHRmb3IgKCB2YXIgaSA9ICggc3RhcnRJZHggfHwgMCApOyBpIDwgYXJncy5sZW5ndGg7IGkrKyApIHtcblx0XHRyZXN1bHRbIGkgXSA9IGFyZ3NbIGkgXTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuLypcblx0aGFuZGxlIC0+XG5cdFx0Y2hpbGQgPSBzdGF0ZU9iai5fY2hpbGQgJiYgc3RhdGVPYmouX2NoaWxkLmluc3RhbmNlO1xuXG5cdHRyYW5zaXRpb24gLT5cblx0XHRuZXdTdGF0ZU9iai5fY2hpbGQgPSBnZXRDaGlsZEZzbUluc3RhbmNlKCBuZXdTdGF0ZU9iai5fY2hpbGQgKTtcblx0XHRjaGlsZCA9IG5ld1N0YXRlT2JqLl9jaGlsZCAmJiBuZXdTdGF0ZU9iai5fY2hpbGQuaW5zdGFuY2U7XG4qL1xuZnVuY3Rpb24gZ2V0Q2hpbGRGc21JbnN0YW5jZSggY29uZmlnICkge1xuXHRpZiAoICFjb25maWcgKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHZhciBjaGlsZEZzbURlZmluaXRpb24gPSB7fTtcblx0aWYgKCB0eXBlb2YgY29uZmlnID09PSBcIm9iamVjdFwiICkge1xuXHRcdC8vIGlzIHRoaXMgYSBjb25maWcgb2JqZWN0IHdpdGggYSBmYWN0b3J5P1xuXHRcdGlmICggY29uZmlnLmZhY3RvcnkgKSB7XG5cdFx0XHRjaGlsZEZzbURlZmluaXRpb24gPSBjb25maWc7XG5cdFx0XHRjaGlsZEZzbURlZmluaXRpb24uaW5zdGFuY2UgPSBjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhc3N1bWluZyB0aGlzIGlzIGEgbWFjaGluYSBpbnN0YW5jZVxuXHRcdFx0Y2hpbGRGc21EZWZpbml0aW9uLmZhY3RvcnkgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIGNvbmZpZztcblx0XHRcdH07XG5cdFx0fVxuXHR9IGVsc2UgaWYgKCB0eXBlb2YgY29uZmlnID09PSBcImZ1bmN0aW9uXCIgKSB7XG5cdFx0Y2hpbGRGc21EZWZpbml0aW9uLmZhY3RvcnkgPSBjb25maWc7XG5cdH1cblx0Y2hpbGRGc21EZWZpbml0aW9uLmluc3RhbmNlID0gY2hpbGRGc21EZWZpbml0aW9uLmZhY3RvcnkoKTtcblx0cmV0dXJuIGNoaWxkRnNtRGVmaW5pdGlvbjtcbn1cblxuZnVuY3Rpb24gbGlzdGVuVG9DaGlsZCggZnNtLCBjaGlsZCApIHtcblx0Ly8gTmVlZCB0byBpbnZlc3RpZ2F0ZSBwb3RlbnRpYWwgZm9yIGRpc2NhcmRlZCBldmVudFxuXHQvLyBsaXN0ZW5lciBtZW1vcnkgbGVhayBpbiBsb25nLXJ1bm5pbmcsIGRlZXBseS1uZXN0ZWQgaGllcmFyY2hpZXMuXG5cdHJldHVybiBjaGlsZC5vbiggXCIqXCIsIGZ1bmN0aW9uKCBldmVudE5hbWUsIGRhdGEgKSB7XG5cdFx0c3dpdGNoICggZXZlbnROYW1lICkge1xuXHRcdFx0Y2FzZSBldmVudHMuTk9fSEFORExFUjpcblx0XHRcdFx0aWYgKCAhZGF0YS50aWNrZXQgJiYgIWRhdGEuZGVsZWdhdGVkICYmIGRhdGEubmFtZXNwYWNlICE9PSBmc20ubmFtZXNwYWNlICkge1xuXHRcdFx0XHRcdC8vIE9rIC0gd2UncmUgZGVhbGluZyB3LyBhIGNoaWxkIGhhbmRsaW5nIGlucHV0IHRoYXQgc2hvdWxkIGJ1YmJsZSB1cFxuXHRcdFx0XHRcdGRhdGEuYXJnc1sgMSBdLmJ1YmJsaW5nID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyB3ZSBkbyBOT1QgYnViYmxlIF9yZXNldCBpbnB1dHMgdXAgdG8gdGhlIHBhcmVudFxuXHRcdFx0XHRpZiAoIGRhdGEuaW5wdXRUeXBlICE9PSBcIl9yZXNldFwiICkge1xuXHRcdFx0XHRcdGZzbS5oYW5kbGUuYXBwbHkoIGZzbSwgZGF0YS5hcmdzICk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIGV2ZW50cy5IQU5ETElORyA6XG5cdFx0XHRcdHZhciB0aWNrZXQgPSBkYXRhLnRpY2tldDtcblx0XHRcdFx0aWYgKCB0aWNrZXQgJiYgZnNtLnBlbmRpbmdEZWxlZ2F0aW9uc1sgdGlja2V0IF0gKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGZzbS5wZW5kaW5nRGVsZWdhdGlvbnNbIHRpY2tldCBdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZzbS5lbWl0KCBldmVudE5hbWUsIGRhdGEgKTsgLy8gcG9zc2libHkgdHJhbnNmb3JtIHBheWxvYWQ/XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0ZnNtLmVtaXQoIGV2ZW50TmFtZSwgZGF0YSApOyAvLyBwb3NzaWJseSB0cmFuc2Zvcm0gcGF5bG9hZD9cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9ICk7XG59XG5cbi8vIF9tYWNoS2V5cyBhcmUgbWVtYmVycyB3ZSB3YW50IHRvIHRyYWNrIGFjcm9zcyB0aGUgcHJvdG90eXBlIGNoYWluIG9mIGFuIGV4dGVuZGVkIEZTTSBjb25zdHJ1Y3RvclxuLy8gU2luY2Ugd2Ugd2FudCB0byBldmVudHVhbGx5IG1lcmdlIHRoZSBhZ2dyZWdhdGUgb2YgdGhvc2UgdmFsdWVzIG9udG8gdGhlIGluc3RhbmNlIHNvIHRoYXQgRlNNc1xuLy8gdGhhdCBzaGFyZSB0aGUgc2FtZSBleHRlbmRlZCBwcm90b3R5cGUgd29uJ3Qgc2hhcmUgc3RhdGUgKm9uKiB0aG9zZSBwcm90b3R5cGVzLlxudmFyIF9tYWNoS2V5cyA9IFsgXCJzdGF0ZXNcIiwgXCJpbml0aWFsU3RhdGVcIiBdO1xudmFyIGV4dGVuZCA9IGZ1bmN0aW9uKCBwcm90b1Byb3BzLCBzdGF0aWNQcm9wcyApIHtcblx0dmFyIHBhcmVudCA9IHRoaXM7XG5cdHZhciBmc207IC8vIHBsYWNlaG9sZGVyIGZvciBpbnN0YW5jZSBjb25zdHJ1Y3RvclxuXHR2YXIgbWFjaE9iaiA9IHt9OyAvLyBvYmplY3QgdXNlZCB0byBob2xkIGluaXRpYWxTdGF0ZSAmIHN0YXRlcyBmcm9tIHByb3RvdHlwZSBmb3IgaW5zdGFuY2UtbGV2ZWwgbWVyZ2luZ1xuXHR2YXIgQ3RvciA9IGZ1bmN0aW9uKCkge307IC8vIHBsYWNlaG9sZGVyIGN0b3IgZnVuY3Rpb24gdXNlZCB0byBpbnNlcnQgbGV2ZWwgaW4gcHJvdG90eXBlIGNoYWluXG5cblx0Ly8gVGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIGZvciB0aGUgbmV3IHN1YmNsYXNzIGlzIGVpdGhlciBkZWZpbmVkIGJ5IHlvdVxuXHQvLyAodGhlIFwiY29uc3RydWN0b3JcIiBwcm9wZXJ0eSBpbiB5b3VyIGBleHRlbmRgIGRlZmluaXRpb24pLCBvciBkZWZhdWx0ZWRcblx0Ly8gYnkgdXMgdG8gc2ltcGx5IGNhbGwgdGhlIHBhcmVudCdzIGNvbnN0cnVjdG9yLlxuXHRpZiAoIHByb3RvUHJvcHMgJiYgcHJvdG9Qcm9wcy5oYXNPd25Qcm9wZXJ0eSggXCJjb25zdHJ1Y3RvclwiICkgKSB7XG5cdFx0ZnNtID0gcHJvdG9Qcm9wcy5jb25zdHJ1Y3Rvcjtcblx0fSBlbHNlIHtcblx0XHQvLyBUaGUgZGVmYXVsdCBtYWNoaW5hIGNvbnN0cnVjdG9yICh3aGVuIHVzaW5nIGluaGVyaXRhbmNlKSBjcmVhdGVzIGFcblx0XHQvLyBkZWVwIGNvcHkgb2YgdGhlIHN0YXRlcy9pbml0aWFsU3RhdGUgdmFsdWVzIGZyb20gdGhlIHByb3RvdHlwZSBhbmRcblx0XHQvLyBleHRlbmRzIHRoZW0gb3ZlciB0aGUgaW5zdGFuY2Ugc28gdGhhdCB0aGV5J2xsIGJlIGluc3RhbmNlLWxldmVsLlxuXHRcdC8vIElmIGFuIG9wdGlvbnMgYXJnIChhcmdzWzBdKSBpcyBwYXNzZWQgaW4sIGEgc3RhdGVzIG9yIGludGlhbFN0YXRlXG5cdFx0Ly8gdmFsdWUgd2lsbCBiZSBwcmVmZXJyZWQgb3ZlciBhbnkgZGF0YSBwdWxsZWQgdXAgZnJvbSB0aGUgcHJvdG90eXBlLlxuXHRcdGZzbSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGFyZ3MgPSBzbGljZS5jYWxsKCBhcmd1bWVudHMsIDAgKTtcblx0XHRcdGFyZ3NbIDAgXSA9IGFyZ3NbIDAgXSB8fCB7fTtcblx0XHRcdHZhciBibGVuZGVkU3RhdGU7XG5cdFx0XHR2YXIgaW5zdGFuY2VTdGF0ZXMgPSBhcmdzWyAwIF0uc3RhdGVzIHx8IHt9O1xuXHRcdFx0YmxlbmRlZFN0YXRlID0gXy5tZXJnZSggXy5jbG9uZURlZXAoIG1hY2hPYmogKSwgeyBzdGF0ZXM6IGluc3RhbmNlU3RhdGVzIH0gKTtcblx0XHRcdGJsZW5kZWRTdGF0ZS5pbml0aWFsU3RhdGUgPSBhcmdzWyAwIF0uaW5pdGlhbFN0YXRlIHx8IHRoaXMuaW5pdGlhbFN0YXRlO1xuXHRcdFx0Xy5leHRlbmQoIGFyZ3NbIDAgXSwgYmxlbmRlZFN0YXRlICk7XG5cdFx0XHRwYXJlbnQuYXBwbHkoIHRoaXMsIGFyZ3MgKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gSW5oZXJpdCBjbGFzcyAoc3RhdGljKSBwcm9wZXJ0aWVzIGZyb20gcGFyZW50LlxuXHRfLm1lcmdlKCBmc20sIHBhcmVudCApO1xuXG5cdC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG5cdC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG5cdEN0b3IucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcblx0ZnNtLnByb3RvdHlwZSA9IG5ldyBDdG9yKCk7XG5cblx0Ly8gQWRkIHByb3RvdHlwZSBwcm9wZXJ0aWVzIChpbnN0YW5jZSBwcm9wZXJ0aWVzKSB0byB0aGUgc3ViY2xhc3MsXG5cdC8vIGlmIHN1cHBsaWVkLlxuXHRpZiAoIHByb3RvUHJvcHMgKSB7XG5cdFx0Xy5leHRlbmQoIGZzbS5wcm90b3R5cGUsIHByb3RvUHJvcHMgKTtcblx0XHRfLm1lcmdlKCBtYWNoT2JqLCBfLnRyYW5zZm9ybSggcHJvdG9Qcm9wcywgZnVuY3Rpb24oIGFjY3VtLCB2YWwsIGtleSApIHtcblx0XHRcdGlmICggX21hY2hLZXlzLmluZGV4T2YoIGtleSApICE9PSAtMSApIHtcblx0XHRcdFx0YWNjdW1bIGtleSBdID0gdmFsO1xuXHRcdFx0fVxuXHRcdH0gKSApO1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdGlmICggc3RhdGljUHJvcHMgKSB7XG5cdFx0Xy5tZXJnZSggZnNtLCBzdGF0aWNQcm9wcyApO1xuXHR9XG5cblx0Ly8gQ29ycmVjdGx5IHNldCBjaGlsZCdzIGBwcm90b3R5cGUuY29uc3RydWN0b3JgLlxuXHRmc20ucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gZnNtO1xuXG5cdC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWQgbGF0ZXIuXG5cdGZzbS5fX3N1cGVyX18gPSBwYXJlbnQucHJvdG90eXBlO1xuXHRyZXR1cm4gZnNtO1xufTtcblxuZnVuY3Rpb24gY3JlYXRlVVVJRCgpIHtcblx0dmFyIHMgPSBbXTtcblx0dmFyIGhleERpZ2l0cyA9IFwiMDEyMzQ1Njc4OWFiY2RlZlwiO1xuXHRmb3IgKCB2YXIgaSA9IDA7IGkgPCAzNjsgaSsrICkge1xuXHRcdHNbIGkgXSA9IGhleERpZ2l0cy5zdWJzdHIoIE1hdGguZmxvb3IoIE1hdGgucmFuZG9tKCkgKiAweDEwICksIDEgKTtcblx0fVxuXHRzWyAxNCBdID0gXCI0XCI7IC8vIGJpdHMgMTItMTUgb2YgdGhlIHRpbWVfaGlfYW5kX3ZlcnNpb24gZmllbGQgdG8gMDAxMFxuXHQvKiBqc2hpbnQgaWdub3JlOnN0YXJ0ICovXG5cdHNbIDE5IF0gPSBoZXhEaWdpdHMuc3Vic3RyKCAoIHNbIDE5IF0gJiAweDMgKSB8IDB4OCwgMSApOyAvLyBiaXRzIDYtNyBvZiB0aGUgY2xvY2tfc2VxX2hpX2FuZF9yZXNlcnZlZCB0byAwMVxuXHQvKiBqc2hpbnQgaWdub3JlOmVuZCAqL1xuXHRzWyA4IF0gPSBzWyAxMyBdID0gc1sgMTggXSA9IHNbIDIzIF0gPSBcIi1cIjtcblx0cmV0dXJuIHMuam9pbiggXCJcIiApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0Y3JlYXRlVVVJRDogY3JlYXRlVVVJRCxcblx0ZXh0ZW5kOiBleHRlbmQsXG5cdGdldERlZmF1bHRCZWhhdmlvcmFsT3B0aW9uczogZ2V0RGVmYXVsdEJlaGF2aW9yYWxPcHRpb25zLFxuXHRnZXREZWZhdWx0T3B0aW9uczogZ2V0RGVmYXVsdEJlaGF2aW9yYWxPcHRpb25zLFxuXHRnZXREZWZhdWx0Q2xpZW50TWV0YTogZ2V0RGVmYXVsdENsaWVudE1ldGEsXG5cdGdldENoaWxkRnNtSW5zdGFuY2U6IGdldENoaWxkRnNtSW5zdGFuY2UsXG5cdGdldExlYWtsZXNzQXJnczogZ2V0TGVha2xlc3NBcmdzLFxuXHRsaXN0ZW5Ub0NoaWxkOiBsaXN0ZW5Ub0NoaWxkLFxuXHRtYWtlRnNtTmFtZXNwYWNlOiBtYWtlRnNtTmFtZXNwYWNlXG59O1xuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXRUJQQUNLIEZPT1RFUlxuLy8gLi9zcmMvdXRpbHMuanNcbi8vIG1vZHVsZSBpZCA9IDNcbi8vIG1vZHVsZSBjaHVua3MgPSAwIiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdE5FWFRfVFJBTlNJVElPTjogXCJ0cmFuc2l0aW9uXCIsXG5cdEhBTkRMSU5HOiBcImhhbmRsaW5nXCIsXG5cdEhBTkRMRUQ6IFwiaGFuZGxlZFwiLFxuXHROT19IQU5ETEVSOiBcIm5vaGFuZGxlclwiLFxuXHRUUkFOU0lUSU9OOiBcInRyYW5zaXRpb25cIixcblx0VFJBTlNJVElPTkVEOiBcInRyYW5zaXRpb25lZFwiLFxuXHRJTlZBTElEX1NUQVRFOiBcImludmFsaWRzdGF0ZVwiLFxuXHRERUZFUlJFRDogXCJkZWZlcnJlZFwiLFxuXHRORVdfRlNNOiBcIm5ld2ZzbVwiXG59O1xuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXRUJQQUNLIEZPT1RFUlxuLy8gLi9zcmMvZXZlbnRzLmpzXG4vLyBtb2R1bGUgaWQgPSA0XG4vLyBtb2R1bGUgY2h1bmtzID0gMCIsInZhciBCZWhhdmlvcmFsRnNtID0gcmVxdWlyZSggXCIuL0JlaGF2aW9yYWxGc21cIiApO1xudmFyIHV0aWxzID0gcmVxdWlyZSggXCIuL3V0aWxzXCIgKTtcbnZhciBfID0gcmVxdWlyZSggXCJsb2Rhc2hcIiApO1xuXG52YXIgRnNtID0ge1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0QmVoYXZpb3JhbEZzbS5hcHBseSggdGhpcywgYXJndW1lbnRzICk7XG5cdFx0dGhpcy5lbnN1cmVDbGllbnRNZXRhKCk7XG5cdH0sXG5cdGluaXRDbGllbnQ6IGZ1bmN0aW9uIGluaXRDbGllbnQoKSB7XG5cdFx0dmFyIGluaXRpYWxTdGF0ZSA9IHRoaXMuaW5pdGlhbFN0YXRlO1xuXHRcdGlmICggIWluaXRpYWxTdGF0ZSApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvciggXCJZb3UgbXVzdCBzcGVjaWZ5IGFuIGluaXRpYWwgc3RhdGUgZm9yIHRoaXMgRlNNXCIgKTtcblx0XHR9XG5cdFx0aWYgKCAhdGhpcy5zdGF0ZXNbIGluaXRpYWxTdGF0ZSBdICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIlRoZSBpbml0aWFsIHN0YXRlIHNwZWNpZmllZCBkb2VzIG5vdCBleGlzdCBpbiB0aGUgc3RhdGVzIG9iamVjdC5cIiApO1xuXHRcdH1cblx0XHR0aGlzLnRyYW5zaXRpb24oIGluaXRpYWxTdGF0ZSApO1xuXHR9LFxuXHRlbnN1cmVDbGllbnRNZXRhOiBmdW5jdGlvbiBlbnN1cmVDbGllbnRNZXRhKCkge1xuXHRcdGlmICggIXRoaXMuX3N0YW1wZWQgKSB7XG5cdFx0XHR0aGlzLl9zdGFtcGVkID0gdHJ1ZTtcblx0XHRcdF8uZGVmYXVsdHMoIHRoaXMsIF8uY2xvbmVEZWVwKCB1dGlscy5nZXREZWZhdWx0Q2xpZW50TWV0YSgpICkgKTtcblx0XHRcdHRoaXMuaW5pdENsaWVudCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRlbnN1cmVDbGllbnRBcmc6IGZ1bmN0aW9uKCBhcmdzICkge1xuXHRcdHZhciBfYXJncyA9IGFyZ3M7XG5cdFx0Ly8gd2UgbmVlZCB0byB0ZXN0IHRoZSBhcmdzIGFuZCB2ZXJpZnkgdGhhdCBpZiBhIGNsaWVudCBhcmcgaGFzXG5cdFx0Ly8gYmVlbiBwYXNzZWQsIGl0IG11c3QgYmUgdGhpcyBGU00gaW5zdGFuY2UgKHRoaXMgaXNuJ3QgYSBiZWhhdmlvcmFsIEZTTSlcblx0XHRpZiAoIHR5cGVvZiBfYXJnc1sgMCBdID09PSBcIm9iamVjdFwiICYmICEoIFwiaW5wdXRUeXBlXCIgaW4gX2FyZ3NbIDAgXSApICYmIF9hcmdzWyAwIF0gIT09IHRoaXMgKSB7XG5cdFx0XHRfYXJncy5zcGxpY2UoIDAsIDEsIHRoaXMgKTtcblx0XHR9IGVsc2UgaWYgKCB0eXBlb2YgX2FyZ3NbIDAgXSAhPT0gXCJvYmplY3RcIiB8fCAoIHR5cGVvZiBfYXJnc1sgMCBdID09PSBcIm9iamVjdFwiICYmICggXCJpbnB1dFR5cGVcIiBpbiBfYXJnc1sgMCBdICkgKSApIHtcblx0XHRcdF9hcmdzLnVuc2hpZnQoIHRoaXMgKTtcblx0XHR9XG5cdFx0cmV0dXJuIF9hcmdzO1xuXHR9LFxuXG5cdGdldEhhbmRsZXJBcmdzOiBmdW5jdGlvbiggYXJncywgaXNDYXRjaEFsbCApIHtcblx0XHQvLyBpbmRleCAwIGlzIHRoZSBjbGllbnQsIGluZGV4IDEgaXMgaW5wdXRUeXBlXG5cdFx0Ly8gaWYgd2UncmUgaW4gYSBjYXRjaC1hbGwgaGFuZGxlciwgaW5wdXQgdHlwZSBuZWVkcyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgYXJnc1xuXHRcdC8vIGlucHV0VHlwZSBtaWdodCBiZSBhbiBvYmplY3QsIHNvIHdlIG5lZWQgdG8ganVzdCBnZXQgdGhlIGlucHV0VHlwZSBzdHJpbmcgaWYgc29cblx0XHR2YXIgX2FyZ3MgPSBhcmdzO1xuXHRcdHZhciBpbnB1dCA9IF9hcmdzWyAxIF07XG5cdFx0aWYgKCB0eXBlb2YgaW5wdXRUeXBlID09PSBcIm9iamVjdFwiICkge1xuXHRcdFx0X2FyZ3Muc3BsaWNlKCAxLCAxLCBpbnB1dC5pbnB1dFR5cGUgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGlzQ2F0Y2hBbGwgP1xuXHRcdFx0X2FyZ3Muc2xpY2UoIDEgKSA6XG5cdFx0XHRfYXJncy5zbGljZSggMiApO1xuXHR9LFxuXG5cdGdldFN5c3RlbUhhbmRsZXJBcmdzOiBmdW5jdGlvbiggYXJncywgY2xpZW50ICkge1xuXHRcdHJldHVybiBhcmdzO1xuXHR9LFxuXG5cdC8vIFwiY2xhc3NpY1wiIG1hY2hpbmEgRlNNIGRvIG5vdCBlbWl0IHRoZSBjbGllbnQgcHJvcGVydHkgb24gZXZlbnRzICh3aGljaCB3b3VsZCBiZSB0aGUgRlNNIGl0c2VsZilcblx0YnVpbGRFdmVudFBheWxvYWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gdGhpcy5lbnN1cmVDbGllbnRBcmcoIHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICkgKTtcblx0XHR2YXIgZGF0YSA9IGFyZ3NbIDEgXTtcblx0XHRpZiAoIF8uaXNQbGFpbk9iamVjdCggZGF0YSApICkge1xuXHRcdFx0cmV0dXJuIF8uZXh0ZW5kKCBkYXRhLCB7IG5hbWVzcGFjZTogdGhpcy5uYW1lc3BhY2UgfSApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBkYXRhIHx8IG51bGwsIG5hbWVzcGFjZTogdGhpcy5uYW1lc3BhY2UgfTtcblx0XHR9XG5cdH1cbn07XG5cbl8uZWFjaCggW1xuXHRcImhhbmRsZVwiLFxuXHRcInRyYW5zaXRpb25cIixcblx0XCJkZWZlclVudGlsVHJhbnNpdGlvblwiLFxuXHRcInByb2Nlc3NRdWV1ZVwiLFxuXHRcImNsZWFyUXVldWVcIlxuXSwgZnVuY3Rpb24oIG1ldGhvZFdpdGhDbGllbnRJbmplY3RlZCApIHtcblx0RnNtWyBtZXRob2RXaXRoQ2xpZW50SW5qZWN0ZWQgXSA9IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gdGhpcy5lbnN1cmVDbGllbnRBcmcoIHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICkgKTtcblx0XHRyZXR1cm4gQmVoYXZpb3JhbEZzbS5wcm90b3R5cGVbIG1ldGhvZFdpdGhDbGllbnRJbmplY3RlZCBdLmFwcGx5KCB0aGlzLCBhcmdzICk7XG5cdH07XG59ICk7XG5cbkZzbSA9IEJlaGF2aW9yYWxGc20uZXh0ZW5kKCBGc20gKTtcblxubW9kdWxlLmV4cG9ydHMgPSBGc207XG5cblxuXG4vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFdFQlBBQ0sgRk9PVEVSXG4vLyAuL3NyYy9Gc20uanNcbi8vIG1vZHVsZSBpZCA9IDVcbi8vIG1vZHVsZSBjaHVua3MgPSAwIiwidmFyIF8gPSByZXF1aXJlKCBcImxvZGFzaFwiICk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCBcIi4vdXRpbHNcIiApO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCBcIi4vZW1pdHRlclwiICk7XG52YXIgdG9wTGV2ZWxFbWl0dGVyID0gZW1pdHRlci5pbnN0YW5jZTtcbnZhciBldmVudHMgPSByZXF1aXJlKCBcIi4vZXZlbnRzXCIgKTtcblxudmFyIE1BQ0hJTkFfUFJPUCA9IFwiX19tYWNoaW5hX19cIjtcblxuZnVuY3Rpb24gQmVoYXZpb3JhbEZzbSggb3B0aW9ucyApIHtcblx0Xy5leHRlbmQoIHRoaXMsIG9wdGlvbnMgKTtcblx0Xy5kZWZhdWx0cyggdGhpcywgdXRpbHMuZ2V0RGVmYXVsdEJlaGF2aW9yYWxPcHRpb25zKCkgKTtcblx0dGhpcy5pbml0aWFsaXplLmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTtcblx0dG9wTGV2ZWxFbWl0dGVyLmVtaXQoIGV2ZW50cy5ORVdfRlNNLCB0aGlzICk7XG59XG5cbl8uZXh0ZW5kKCBCZWhhdmlvcmFsRnNtLnByb3RvdHlwZSwge1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpIHt9LFxuXG5cdGluaXRDbGllbnQ6IGZ1bmN0aW9uIGluaXRDbGllbnQoIGNsaWVudCApIHtcblx0XHR2YXIgaW5pdGlhbFN0YXRlID0gdGhpcy5pbml0aWFsU3RhdGU7XG5cdFx0aWYgKCAhaW5pdGlhbFN0YXRlICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIllvdSBtdXN0IHNwZWNpZnkgYW4gaW5pdGlhbCBzdGF0ZSBmb3IgdGhpcyBGU01cIiApO1xuXHRcdH1cblx0XHRpZiAoICF0aGlzLnN0YXRlc1sgaW5pdGlhbFN0YXRlIF0gKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoIFwiVGhlIGluaXRpYWwgc3RhdGUgc3BlY2lmaWVkIGRvZXMgbm90IGV4aXN0IGluIHRoZSBzdGF0ZXMgb2JqZWN0LlwiICk7XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNpdGlvbiggY2xpZW50LCBpbml0aWFsU3RhdGUgKTtcblx0fSxcblxuXHRjb25maWdGb3JTdGF0ZTogZnVuY3Rpb24gY29uZmlnRm9yU3RhdGUoIG5ld1N0YXRlICkge1xuXHRcdHZhciBuZXdTdGF0ZU9iaiA9IHRoaXMuc3RhdGVzWyBuZXdTdGF0ZSBdO1xuXHRcdHZhciBjaGlsZDtcblx0XHRfLmVhY2goIHRoaXMuaGllcmFyY2h5LCBmdW5jdGlvbiggY2hpbGRMaXN0ZW5lciwga2V5ICkge1xuXHRcdFx0aWYgKCBjaGlsZExpc3RlbmVyICYmIHR5cGVvZiBjaGlsZExpc3RlbmVyLm9mZiA9PT0gXCJmdW5jdGlvblwiICkge1xuXHRcdFx0XHRjaGlsZExpc3RlbmVyLm9mZigpO1xuXHRcdFx0fVxuXHRcdH0gKTtcblxuXHRcdGlmICggbmV3U3RhdGVPYmouX2NoaWxkICkge1xuXHRcdFx0bmV3U3RhdGVPYmouX2NoaWxkID0gdXRpbHMuZ2V0Q2hpbGRGc21JbnN0YW5jZSggbmV3U3RhdGVPYmouX2NoaWxkICk7XG5cdFx0XHRjaGlsZCA9IG5ld1N0YXRlT2JqLl9jaGlsZCAmJiBuZXdTdGF0ZU9iai5fY2hpbGQuaW5zdGFuY2U7XG5cdFx0XHR0aGlzLmhpZXJhcmNoeVsgY2hpbGQubmFtZXNwYWNlIF0gPSB1dGlscy5saXN0ZW5Ub0NoaWxkKCB0aGlzLCBjaGlsZCApO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZDtcblx0fSxcblxuXHRlbnN1cmVDbGllbnRNZXRhOiBmdW5jdGlvbiBlbnN1cmVDbGllbnRNZXRhKCBjbGllbnQgKSB7XG5cdFx0aWYgKCB0eXBlb2YgY2xpZW50ICE9PSBcIm9iamVjdFwiICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIkFuIEZTTSBjbGllbnQgbXVzdCBiZSBhbiBvYmplY3QuXCIgKTtcblx0XHR9XG5cdFx0Y2xpZW50WyBNQUNISU5BX1BST1AgXSA9IGNsaWVudFsgTUFDSElOQV9QUk9QIF0gfHwge307XG5cdFx0aWYgKCAhY2xpZW50WyBNQUNISU5BX1BST1AgXVsgdGhpcy5uYW1lc3BhY2UgXSApIHtcblx0XHRcdGNsaWVudFsgTUFDSElOQV9QUk9QIF1bIHRoaXMubmFtZXNwYWNlIF0gPSBfLmNsb25lRGVlcCggdXRpbHMuZ2V0RGVmYXVsdENsaWVudE1ldGEoKSApO1xuXHRcdFx0dGhpcy5pbml0Q2xpZW50KCBjbGllbnQgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNsaWVudFsgTUFDSElOQV9QUk9QIF1bIHRoaXMubmFtZXNwYWNlIF07XG5cdH0sXG5cblx0YnVpbGRFdmVudFBheWxvYWQ6IGZ1bmN0aW9uKCBjbGllbnQsIGRhdGEgKSB7XG5cdFx0aWYgKCBfLmlzUGxhaW5PYmplY3QoIGRhdGEgKSApIHtcblx0XHRcdHJldHVybiBfLmV4dGVuZCggZGF0YSwgeyBjbGllbnQ6IGNsaWVudCwgbmFtZXNwYWNlOiB0aGlzLm5hbWVzcGFjZSB9ICk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IGNsaWVudDogY2xpZW50LCBkYXRhOiBkYXRhIHx8IG51bGwsIG5hbWVzcGFjZTogdGhpcy5uYW1lc3BhY2UgfTtcblx0XHR9XG5cdH0sXG5cblx0Z2V0SGFuZGxlckFyZ3M6IGZ1bmN0aW9uKCBhcmdzLCBpc0NhdGNoQWxsICkge1xuXHRcdC8vIGluZGV4IDAgaXMgdGhlIGNsaWVudCwgaW5kZXggMSBpcyBpbnB1dFR5cGVcblx0XHQvLyBpZiB3ZSdyZSBpbiBhIGNhdGNoLWFsbCBoYW5kbGVyLCBpbnB1dCB0eXBlIG5lZWRzIHRvIGJlIGluY2x1ZGVkIGluIHRoZSBhcmdzXG5cdFx0Ly8gaW5wdXRUeXBlIG1pZ2h0IGJlIGFuIG9iamVjdCwgc28gd2UgbmVlZCB0byBqdXN0IGdldCB0aGUgaW5wdXRUeXBlIHN0cmluZyBpZiBzb1xuXHRcdHZhciBfYXJncyA9IGFyZ3Muc2xpY2UoIDAgKTtcblx0XHR2YXIgaW5wdXQgPSBfYXJnc1sgMSBdO1xuXHRcdGlmICggdHlwZW9mIGlucHV0ID09PSBcIm9iamVjdFwiICkge1xuXHRcdFx0X2FyZ3Muc3BsaWNlKCAxLCAxLCBpbnB1dC5pbnB1dFR5cGUgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGlzQ2F0Y2hBbGwgP1xuXHRcdFx0X2FyZ3MgOlxuXHRcdFx0WyBfYXJnc1sgMCBdIF0uY29uY2F0KCBfYXJncy5zbGljZSggMiApICk7XG5cdH0sXG5cblx0Z2V0U3lzdGVtSGFuZGxlckFyZ3M6IGZ1bmN0aW9uKCBhcmdzLCBjbGllbnQgKSB7XG5cdFx0cmV0dXJuIFsgY2xpZW50IF0uY29uY2F0KCBhcmdzICk7XG5cdH0sXG5cblx0aGFuZGxlOiBmdW5jdGlvbiggY2xpZW50LCBpbnB1dCApIHtcblx0XHR2YXIgaW5wdXREZWYgPSBpbnB1dDtcblx0XHRpZiAoIHR5cGVvZiBpbnB1dCA9PT0gXCJ1bmRlZmluZWRcIiApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvciggXCJUaGUgaW5wdXQgYXJndW1lbnQgcGFzc2VkIHRvIHRoZSBGU00ncyBoYW5kbGUgbWV0aG9kIGlzIHVuZGVmaW5lZC4gRGlkIHlvdSBmb3JnZXQgdG8gcGFzcyB0aGUgaW5wdXQgbmFtZT9cIiApO1xuXHRcdH1cblx0XHRpZiAoIHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIiApIHtcblx0XHRcdGlucHV0RGVmID0geyBpbnB1dFR5cGU6IGlucHV0LCBkZWxlZ2F0ZWQ6IGZhbHNlLCB0aWNrZXQ6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0dmFyIGFyZ3MgPSB1dGlscy5nZXRMZWFrbGVzc0FyZ3MoIGFyZ3VtZW50cyApO1xuXHRcdGlmICggdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiICkge1xuXHRcdFx0YXJncy5zcGxpY2UoIDEsIDEsIGlucHV0RGVmICk7XG5cdFx0fVxuXHRcdGNsaWVudE1ldGEuY3VycmVudEFjdGlvbkFyZ3MgPSBhcmdzLnNsaWNlKCAxICk7XG5cdFx0dmFyIGN1cnJlbnRTdGF0ZSA9IGNsaWVudE1ldGEuc3RhdGU7XG5cdFx0dmFyIHN0YXRlT2JqID0gdGhpcy5zdGF0ZXNbIGN1cnJlbnRTdGF0ZSBdO1xuXHRcdHZhciBoYW5kbGVyTmFtZTtcblx0XHR2YXIgaGFuZGxlcjtcblx0XHR2YXIgaXNDYXRjaEFsbCA9IGZhbHNlO1xuXHRcdHZhciBjaGlsZDtcblx0XHR2YXIgcmVzdWx0O1xuXHRcdHZhciBhY3Rpb247XG5cdFx0aWYgKCAhY2xpZW50TWV0YS5pbkV4aXRIYW5kbGVyICkge1xuXHRcdFx0Y2hpbGQgPSB0aGlzLmNvbmZpZ0ZvclN0YXRlKCBjdXJyZW50U3RhdGUgKTtcblx0XHRcdGlmICggY2hpbGQgJiYgIXRoaXMucGVuZGluZ0RlbGVnYXRpb25zWyBpbnB1dERlZi50aWNrZXQgXSAmJiAhaW5wdXREZWYuYnViYmxpbmcgKSB7XG5cdFx0XHRcdGlucHV0RGVmLnRpY2tldCA9ICggaW5wdXREZWYudGlja2V0IHx8IHV0aWxzLmNyZWF0ZVVVSUQoKSApO1xuXHRcdFx0XHRpbnB1dERlZi5kZWxlZ2F0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdEZWxlZ2F0aW9uc1sgaW5wdXREZWYudGlja2V0IF0gPSB7IGRlbGVnYXRlZFRvOiBjaGlsZC5uYW1lc3BhY2UgfTtcblx0XHRcdFx0Ly8gV0FSTklORyAtIHJldHVybmluZyBhIHZhbHVlIGZyb20gYGhhbmRsZWAgb24gY2hpbGQgRlNNcyBpcyBub3QgcmVhbGx5IHN1cHBvcnRlZC5cblx0XHRcdFx0Ly8gSWYgeW91IG5lZWQgdG8gcmV0dXJuIHZhbHVlcyBmcm9tIGNoaWxkIEZTTSBpbnB1dCBoYW5kbGVycywgdXNlIGV2ZW50cyBpbnN0ZWFkLlxuXHRcdFx0XHRyZXN1bHQgPSBjaGlsZC5oYW5kbGUuYXBwbHkoIGNoaWxkLCBhcmdzICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIGlucHV0RGVmLnRpY2tldCAmJiB0aGlzLnBlbmRpbmdEZWxlZ2F0aW9uc1sgaW5wdXREZWYudGlja2V0IF0gKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMucGVuZGluZ0RlbGVnYXRpb25zWyBpbnB1dERlZi50aWNrZXQgXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRoYW5kbGVyTmFtZSA9IHN0YXRlT2JqWyBpbnB1dERlZi5pbnB1dFR5cGUgXSA/IGlucHV0RGVmLmlucHV0VHlwZSA6IFwiKlwiO1xuXHRcdFx0XHRpc0NhdGNoQWxsID0gKCBoYW5kbGVyTmFtZSA9PT0gXCIqXCIgKTtcblx0XHRcdFx0aGFuZGxlciA9ICggc3RhdGVPYmpbIGhhbmRsZXJOYW1lIF0gfHwgdGhpc1sgaGFuZGxlck5hbWUgXSApIHx8IHRoaXNbIFwiKlwiIF07XG5cdFx0XHRcdGFjdGlvbiA9IGNsaWVudE1ldGEuc3RhdGUgKyBcIi5cIiArIGhhbmRsZXJOYW1lO1xuXHRcdFx0XHRjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb24gPSBhY3Rpb247XG5cdFx0XHRcdHZhciBldmVudFBheWxvYWQgPSB0aGlzLmJ1aWxkRXZlbnRQYXlsb2FkKFxuXHRcdFx0XHRcdGNsaWVudCxcblx0XHRcdFx0XHR7IGlucHV0VHlwZTogaW5wdXREZWYuaW5wdXRUeXBlLCBkZWxlZ2F0ZWQ6IGlucHV0RGVmLmRlbGVnYXRlZCwgdGlja2V0OiBpbnB1dERlZi50aWNrZXQgfVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoICFoYW5kbGVyICkge1xuXHRcdFx0XHRcdHRoaXMuZW1pdCggZXZlbnRzLk5PX0hBTkRMRVIsIF8uZXh0ZW5kKCB7IGFyZ3M6IGFyZ3MgfSwgZXZlbnRQYXlsb2FkICkgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5IQU5ETElORywgZXZlbnRQYXlsb2FkICk7XG5cdFx0XHRcdFx0aWYgKCB0eXBlb2YgaGFuZGxlciA9PT0gXCJmdW5jdGlvblwiICkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gaGFuZGxlci5hcHBseSggdGhpcywgdGhpcy5nZXRIYW5kbGVyQXJncyggYXJncywgaXNDYXRjaEFsbCApICk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc3VsdCA9IGhhbmRsZXI7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYW5zaXRpb24oIGNsaWVudCwgaGFuZGxlciApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5IQU5ETEVELCBldmVudFBheWxvYWQgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnRNZXRhLnByaW9yQWN0aW9uID0gY2xpZW50TWV0YS5jdXJyZW50QWN0aW9uO1xuXHRcdFx0XHRjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb24gPSBcIlwiO1xuXHRcdFx0XHRjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb25BcmdzID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9LFxuXG5cdHRyYW5zaXRpb246IGZ1bmN0aW9uKCBjbGllbnQsIG5ld1N0YXRlICkge1xuXHRcdHZhciBjbGllbnRNZXRhID0gdGhpcy5lbnN1cmVDbGllbnRNZXRhKCBjbGllbnQgKTtcblx0XHR2YXIgY3VyU3RhdGUgPSBjbGllbnRNZXRhLnN0YXRlO1xuXHRcdHZhciBjdXJTdGF0ZU9iaiA9IHRoaXMuc3RhdGVzWyBjdXJTdGF0ZSBdO1xuXHRcdHZhciBuZXdTdGF0ZU9iaiA9IHRoaXMuc3RhdGVzWyBuZXdTdGF0ZSBdO1xuXHRcdHZhciBjaGlsZDtcblx0XHR2YXIgYXJncyA9IHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICkuc2xpY2UoIDIgKTtcblx0XHRpZiAoICFjbGllbnRNZXRhLmluRXhpdEhhbmRsZXIgJiYgbmV3U3RhdGUgIT09IGN1clN0YXRlICkge1xuXHRcdFx0aWYgKCBuZXdTdGF0ZU9iaiApIHtcblx0XHRcdFx0Y2hpbGQgPSB0aGlzLmNvbmZpZ0ZvclN0YXRlKCBuZXdTdGF0ZSApO1xuXHRcdFx0XHRpZiAoIGN1clN0YXRlT2JqICYmIGN1clN0YXRlT2JqLl9vbkV4aXQgKSB7XG5cdFx0XHRcdFx0Y2xpZW50TWV0YS5pbkV4aXRIYW5kbGVyID0gdHJ1ZTtcblx0XHRcdFx0XHRjdXJTdGF0ZU9iai5fb25FeGl0LmNhbGwoIHRoaXMsIGNsaWVudCApO1xuXHRcdFx0XHRcdGNsaWVudE1ldGEuaW5FeGl0SGFuZGxlciA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNsaWVudE1ldGEudGFyZ2V0UmVwbGF5U3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdFx0Y2xpZW50TWV0YS5wcmlvclN0YXRlID0gY3VyU3RhdGU7XG5cdFx0XHRcdGNsaWVudE1ldGEuc3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdFx0dmFyIGV2ZW50UGF5bG9hZCA9IHRoaXMuYnVpbGRFdmVudFBheWxvYWQoIGNsaWVudCwge1xuXHRcdFx0XHRcdGZyb21TdGF0ZTogY2xpZW50TWV0YS5wcmlvclN0YXRlLFxuXHRcdFx0XHRcdGFjdGlvbjogY2xpZW50TWV0YS5jdXJyZW50QWN0aW9uLFxuXHRcdFx0XHRcdHRvU3RhdGU6IG5ld1N0YXRlXG5cdFx0XHRcdH0gKTtcblx0XHRcdFx0dGhpcy5lbWl0KCBldmVudHMuVFJBTlNJVElPTiwgZXZlbnRQYXlsb2FkICk7XG5cdFx0XHRcdGlmICggbmV3U3RhdGVPYmouX29uRW50ZXIgKSB7XG5cdFx0XHRcdFx0bmV3U3RhdGVPYmouX29uRW50ZXIuYXBwbHkoIHRoaXMsIHRoaXMuZ2V0U3lzdGVtSGFuZGxlckFyZ3MoIGFyZ3MsIGNsaWVudCApICk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5lbWl0KCBldmVudHMuVFJBTlNJVElPTkVELCBldmVudFBheWxvYWQgKTtcblx0XHRcdFx0aWYgKCBjaGlsZCApIHtcblx0XHRcdFx0XHRjaGlsZC5oYW5kbGUoIGNsaWVudCwgXCJfcmVzZXRcIiApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCBjbGllbnRNZXRhLnRhcmdldFJlcGxheVN0YXRlID09PSBuZXdTdGF0ZSApIHtcblx0XHRcdFx0XHR0aGlzLnByb2Nlc3NRdWV1ZSggY2xpZW50LCBldmVudHMuTkVYVF9UUkFOU0lUSU9OICk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbWl0KCBldmVudHMuSU5WQUxJRF9TVEFURSwgdGhpcy5idWlsZEV2ZW50UGF5bG9hZCggY2xpZW50LCB7XG5cdFx0XHRcdHN0YXRlOiBjbGllbnRNZXRhLnN0YXRlLFxuXHRcdFx0XHRhdHRlbXB0ZWRTdGF0ZTogbmV3U3RhdGVcblx0XHRcdH0gKSApO1xuXHRcdH1cblx0fSxcblxuXHRkZWZlclVudGlsVHJhbnNpdGlvbjogZnVuY3Rpb24oIGNsaWVudCwgc3RhdGVOYW1lICkge1xuXHRcdHZhciBjbGllbnRNZXRhID0gdGhpcy5lbnN1cmVDbGllbnRNZXRhKCBjbGllbnQgKTtcblx0XHR2YXIgc3RhdGVMaXN0ID0gXy5pc0FycmF5KCBzdGF0ZU5hbWUgKSA/IHN0YXRlTmFtZSA6ICggc3RhdGVOYW1lID8gWyBzdGF0ZU5hbWUgXSA6IHVuZGVmaW5lZCApO1xuXHRcdHZhciBwcm9tID0gbnVsbDtcblx0XHRpZiAoIGNsaWVudE1ldGEuY3VycmVudEFjdGlvbkFyZ3MgKSB7XG5cdFx0XHR2YXIgYWRkVG9RdWV1ZSA9ICggZnVuY3Rpb24oIGNhbGxiYWNrICkge1xuXHRcdFx0XHR2YXIgcXVldWVkID0ge1xuXHRcdFx0XHRcdHR5cGU6IGV2ZW50cy5ORVhUX1RSQU5TSVRJT04sXG5cdFx0XHRcdFx0dW50aWxTdGF0ZTogc3RhdGVMaXN0LFxuXHRcdFx0XHRcdGFyZ3M6IGNsaWVudE1ldGEuY3VycmVudEFjdGlvbkFyZ3Ncblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKCBjYWxsYmFjayApIHtcblx0XHRcdFx0XHRxdWV1ZWQuY2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnRNZXRhLmlucHV0UXVldWUucHVzaCggcXVldWVkICk7XG5cblx0XHRcdFx0dmFyIGV2ZW50UGF5bG9hZCA9IHRoaXMuYnVpbGRFdmVudFBheWxvYWQoIGNsaWVudCwge1xuXHRcdFx0XHRcdHN0YXRlOiBjbGllbnRNZXRhLnN0YXRlLFxuXHRcdFx0XHRcdHF1ZXVlZEFyZ3M6IHF1ZXVlZFxuXHRcdFx0XHR9ICk7XG5cdFx0XHRcdHRoaXMuZW1pdCggZXZlbnRzLkRFRkVSUkVELCBldmVudFBheWxvYWQgKTtcblx0XHRcdH0gKS5iaW5kKCB0aGlzICk7XG5cdFx0XHRpZiAoIFByb21pc2UgKSB7XG5cdFx0XHRcdHByb20gPSBuZXcgUHJvbWlzZSggZnVuY3Rpb24oIHJlc29sdmUgKSB7XG5cdFx0XHRcdFx0YWRkVG9RdWV1ZSggcmVzb2x2ZSApO1xuXHRcdFx0XHR9ICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhZGRUb1F1ZXVlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb207XG5cdH0sXG5cblx0ZGVmZXJBbmRUcmFuc2l0aW9uOiBmdW5jdGlvbiggY2xpZW50LCBzdGF0ZU5hbWUgKSB7XG5cdFx0dmFyIHByb20gPSB0aGlzLmRlZmVyVW50aWxUcmFuc2l0aW9uKCBjbGllbnQsIHN0YXRlTmFtZSApO1xuXHRcdHRoaXMudHJhbnNpdGlvbiggY2xpZW50LCBzdGF0ZU5hbWUgKTtcblx0XHRyZXR1cm4gcHJvbTtcblx0fSxcblxuXHRwcm9jZXNzUXVldWU6IGZ1bmN0aW9uKCBjbGllbnQgKSB7XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdHZhciBmaWx0ZXJGbiA9IGZ1bmN0aW9uKCBpdGVtICkge1xuXHRcdFx0cmV0dXJuICggKCAhaXRlbS51bnRpbFN0YXRlICkgfHwgKCBfLmluY2x1ZGVzKCBpdGVtLnVudGlsU3RhdGUsIGNsaWVudE1ldGEuc3RhdGUgKSApICk7XG5cdFx0fTtcblx0XHR2YXIgdG9Qcm9jZXNzID0gXy5maWx0ZXIoIGNsaWVudE1ldGEuaW5wdXRRdWV1ZSwgZmlsdGVyRm4gKTtcblx0XHRjbGllbnRNZXRhLmlucHV0UXVldWUgPSBfLmRpZmZlcmVuY2UoIGNsaWVudE1ldGEuaW5wdXRRdWV1ZSwgdG9Qcm9jZXNzICk7XG5cdFx0Xy5lYWNoKCB0b1Byb2Nlc3MsIGZ1bmN0aW9uKCBpdGVtICkge1xuXHRcdFx0dmFyIHZhbHVlID0gdGhpcy5oYW5kbGUuYXBwbHkoIHRoaXMsIFsgY2xpZW50IF0uY29uY2F0KCBpdGVtLmFyZ3MgKSApO1xuXHRcdFx0aWYgKCBpdGVtLmNhbGxiYWNrICkge1xuXHRcdFx0XHRpdGVtLmNhbGxiYWNrKCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH0uYmluZCggdGhpcyApICk7XG5cdH0sXG5cblx0Y2xlYXJRdWV1ZTogZnVuY3Rpb24oIGNsaWVudCwgbmFtZSApIHtcblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0aWYgKCAhbmFtZSApIHtcblx0XHRcdGNsaWVudE1ldGEuaW5wdXRRdWV1ZSA9IFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBmaXJzdCBwYXNzIHdlIHJlbW92ZSB0aGUgdGFyZ2V0IHN0YXRlIGZyb20gYW55IGB1bnRpbFN0YXRlYCBhcnJheVxuXHRcdFx0Xy5lYWNoKCBjbGllbnRNZXRhLmlucHV0UXVldWUsIGZ1bmN0aW9uKCBpdGVtICkge1xuXHRcdFx0XHRpdGVtLnVudGlsU3RhdGUgPSBfLndpdGhvdXQoIGl0ZW0udW50aWxTdGF0ZSwgbmFtZSApO1xuXHRcdFx0fSApO1xuXHRcdFx0Ly8gc2Vjb25kIHBhc3Mgd2UgY2xlYXIgb3V0IGRlZmVycmVkIGV2ZW50cyB3aXRoIGVtcHR5IHVudGlsU3RhdGUgYXJyYXlzXG5cdFx0XHR2YXIgZmlsdGVyID0gZnVuY3Rpb24oIGV2bnQgKSB7XG5cdFx0XHRcdHJldHVybiBldm50LnVudGlsU3RhdGUubGVuZ3RoICE9PSAwO1xuXHRcdFx0fTtcblx0XHRcdGNsaWVudE1ldGEuaW5wdXRRdWV1ZSA9IF8uZmlsdGVyKCBjbGllbnRNZXRhLmlucHV0UXVldWUsIGZpbHRlciApO1xuXHRcdH1cblx0fSxcblxuXHRjb21wb3NpdGVTdGF0ZTogZnVuY3Rpb24oIGNsaWVudCApIHtcblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0dmFyIHN0YXRlID0gY2xpZW50TWV0YS5zdGF0ZTtcblx0XHR2YXIgY2hpbGQgPSB0aGlzLnN0YXRlc1tzdGF0ZV0uX2NoaWxkICYmIHRoaXMuc3RhdGVzW3N0YXRlXS5fY2hpbGQuaW5zdGFuY2U7XG5cdFx0aWYgKCBjaGlsZCApIHtcblx0XHRcdHN0YXRlICs9IFwiLlwiICsgY2hpbGQuY29tcG9zaXRlU3RhdGUoIGNsaWVudCApO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cbn0sIGVtaXR0ZXIuZ2V0SW5zdGFuY2UoKSApO1xuXG5CZWhhdmlvcmFsRnNtLmV4dGVuZCA9IHV0aWxzLmV4dGVuZDtcblxubW9kdWxlLmV4cG9ydHMgPSBCZWhhdmlvcmFsRnNtO1xuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXRUJQQUNLIEZPT1RFUlxuLy8gLi9zcmMvQmVoYXZpb3JhbEZzbS5qc1xuLy8gbW9kdWxlIGlkID0gNlxuLy8gbW9kdWxlIGNodW5rcyA9IDAiXSwic291cmNlUm9vdCI6IiJ9