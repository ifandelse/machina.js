/*!
 *  * machina - A library for creating powerful and flexible finite state machines. Loosely inspired by Erlang/OTP's gen_fsm behavior.
 *  * Author: Jim Cowart (http://ifandelse.com)
 *  * Version: v1.1.2
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
/***/ function(module, exports, __webpack_require__) {

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


/***/ },
/* 1 */
/***/ function(module, exports) {

	module.exports = __WEBPACK_EXTERNAL_MODULE_1__;

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	var utils = __webpack_require__( 3 );
	
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


/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

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


/***/ },
/* 4 */
/***/ function(module, exports) {

	module.exports = {
		NEXT_TRANSITION: "transition",
		HANDLING: "handling",
		HANDLED: "handled",
		NO_HANDLER: "nohandler",
		TRANSITION: "transition",
		INVALID_STATE: "invalidstate",
		DEFERRED: "deferred",
		NEW_FSM: "newfsm"
	};


/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

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


/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

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
						newStateObj._onEnter.call( this, client );
					}
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
			}, this );
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


/***/ }
/******/ ])
});
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay91bml2ZXJzYWxNb2R1bGVEZWZpbml0aW9uIiwid2VicGFjazovLy93ZWJwYWNrL2Jvb3RzdHJhcCBjMWNjMDhiYTk1NDU5OWI5YmQ0ZiIsIndlYnBhY2s6Ly8vLi9zcmMvbWFjaGluYS5qcyIsIndlYnBhY2s6Ly8vZXh0ZXJuYWwge1wicm9vdFwiOlwiX1wiLFwiY29tbW9uanNcIjpcImxvZGFzaFwiLFwiY29tbW9uanMyXCI6XCJsb2Rhc2hcIixcImFtZFwiOlwibG9kYXNoXCJ9Iiwid2VicGFjazovLy8uL3NyYy9lbWl0dGVyLmpzIiwid2VicGFjazovLy8uL3NyYy91dGlscy5qcyIsIndlYnBhY2s6Ly8vLi9zcmMvZXZlbnRzLmpzIiwid2VicGFjazovLy8uL3NyYy9Gc20uanMiLCJ3ZWJwYWNrOi8vLy4vc3JjL0JlaGF2aW9yYWxGc20uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUM7QUFDRCxPO0FDVkE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsdUJBQWU7QUFDZjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7Ozs7OztBQ3RDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBQzs7Ozs7OztBQ1ZELGdEOzs7Ozs7QUNBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTTtBQUNOO0FBQ0E7QUFDQSxRQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFNO0FBQ047QUFDQTtBQUNBLFFBQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFLO0FBQ0w7QUFDQSxJQUFHOztBQUVIO0FBQ0E7QUFDQSxrREFBaUQ7QUFDakQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUc7O0FBRUg7QUFDQSxrREFBaUQ7QUFDakQ7QUFDQTtBQUNBLEtBQUk7QUFDSjtBQUNBO0FBQ0EsTUFBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQzFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEVBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUc7QUFDSCxhQUFZO0FBQ1o7QUFDQTtBQUNBLGdCQUFlO0FBQ2Y7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0Esa0NBQWlDLGlCQUFpQjtBQUNsRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBRztBQUNIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFFO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUNBQWdDO0FBQ2hDO0FBQ0E7QUFDQSxpQ0FBZ0M7QUFDaEM7QUFDQTtBQUNBLEdBQUU7QUFDRjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxVQUFTO0FBQ1QsbUJBQWtCO0FBQ2xCLDJCQUEwQjs7QUFFMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHFEQUFvRCx5QkFBeUI7QUFDN0U7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFHO0FBQ0g7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxrQkFBaUIsUUFBUTtBQUN6QjtBQUNBO0FBQ0EsZ0JBQWU7QUFDZjtBQUNBLDJEQUEwRDtBQUMxRDtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDbE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDVEE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBRztBQUNIO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw0QkFBMkIsNEJBQTRCO0FBQ3ZELElBQUc7QUFDSCxZQUFXO0FBQ1g7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxFQUFDOztBQUVEOztBQUVBOzs7Ozs7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsMkJBQTBCOztBQUUxQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFFOztBQUVGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBRzs7QUFFSDtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsR0FBRTs7QUFFRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBLDRCQUEyQiw0Q0FBNEM7QUFDdkUsSUFBRztBQUNILFlBQVc7QUFDWDtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRTs7QUFFRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnQkFBZTtBQUNmO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxtREFBa0Q7QUFDbEQ7QUFDQTtBQUNBO0FBQ0EsS0FBSTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTTtBQUNOO0FBQ0E7QUFDQSwrQ0FBOEMsYUFBYTtBQUMzRCxNQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsT0FBTTtBQUNOO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRTs7QUFFRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUk7QUFDSjtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSTtBQUNKO0FBQ0E7QUFDQSxHQUFFOztBQUVGO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBRztBQUNILEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFHO0FBQ0g7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUU7O0FBRUY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBQzs7QUFFRDs7QUFFQSIsImZpbGUiOiJtYWNoaW5hLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIHdlYnBhY2tVbml2ZXJzYWxNb2R1bGVEZWZpbml0aW9uKHJvb3QsIGZhY3RvcnkpIHtcblx0aWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKVxuXHRcdG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKFwibG9kYXNoXCIpKTtcblx0ZWxzZSBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpXG5cdFx0ZGVmaW5lKFtcImxvZGFzaFwiXSwgZmFjdG9yeSk7XG5cdGVsc2UgaWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKVxuXHRcdGV4cG9ydHNbXCJtYWNoaW5hXCJdID0gZmFjdG9yeShyZXF1aXJlKFwibG9kYXNoXCIpKTtcblx0ZWxzZVxuXHRcdHJvb3RbXCJtYWNoaW5hXCJdID0gZmFjdG9yeShyb290W1wiX1wiXSk7XG59KSh0aGlzLCBmdW5jdGlvbihfX1dFQlBBQ0tfRVhURVJOQUxfTU9EVUxFXzFfXykge1xucmV0dXJuIFxuXG5cbi8qKiBXRUJQQUNLIEZPT1RFUiAqKlxuICoqIHdlYnBhY2svdW5pdmVyc2FsTW9kdWxlRGVmaW5pdGlvblxuICoqLyIsIiBcdC8vIFRoZSBtb2R1bGUgY2FjaGVcbiBcdHZhciBpbnN0YWxsZWRNb2R1bGVzID0ge307XG5cbiBcdC8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG4gXHRmdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cbiBcdFx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG4gXHRcdGlmKGluc3RhbGxlZE1vZHVsZXNbbW9kdWxlSWRdKVxuIFx0XHRcdHJldHVybiBpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXS5leHBvcnRzO1xuXG4gXHRcdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG4gXHRcdHZhciBtb2R1bGUgPSBpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSA9IHtcbiBcdFx0XHRleHBvcnRzOiB7fSxcbiBcdFx0XHRpZDogbW9kdWxlSWQsXG4gXHRcdFx0bG9hZGVkOiBmYWxzZVxuIFx0XHR9O1xuXG4gXHRcdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuIFx0XHRtb2R1bGVzW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuIFx0XHQvLyBGbGFnIHRoZSBtb2R1bGUgYXMgbG9hZGVkXG4gXHRcdG1vZHVsZS5sb2FkZWQgPSB0cnVlO1xuXG4gXHRcdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG4gXHRcdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbiBcdH1cblxuXG4gXHQvLyBleHBvc2UgdGhlIG1vZHVsZXMgb2JqZWN0IChfX3dlYnBhY2tfbW9kdWxlc19fKVxuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5tID0gbW9kdWxlcztcblxuIFx0Ly8gZXhwb3NlIHRoZSBtb2R1bGUgY2FjaGVcbiBcdF9fd2VicGFja19yZXF1aXJlX18uYyA9IGluc3RhbGxlZE1vZHVsZXM7XG5cbiBcdC8vIF9fd2VicGFja19wdWJsaWNfcGF0aF9fXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLnAgPSBcIlwiO1xuXG4gXHQvLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbiBcdHJldHVybiBfX3dlYnBhY2tfcmVxdWlyZV9fKDApO1xuXG5cblxuLyoqIFdFQlBBQ0sgRk9PVEVSICoqXG4gKiogd2VicGFjay9ib290c3RyYXAgYzFjYzA4YmE5NTQ1OTliOWJkNGZcbiAqKi8iLCJ2YXIgXyA9IHJlcXVpcmUoIFwibG9kYXNoXCIgKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSggXCIuL2VtaXR0ZXJcIiApO1xuXG5tb2R1bGUuZXhwb3J0cyA9IF8ubWVyZ2UoIGVtaXR0ZXIuaW5zdGFuY2UsIHtcblx0RnNtOiByZXF1aXJlKCBcIi4vRnNtXCIgKSxcblx0QmVoYXZpb3JhbEZzbTogcmVxdWlyZSggXCIuL0JlaGF2aW9yYWxGc21cIiApLFxuXHR1dGlsczogcmVxdWlyZSggXCIuL3V0aWxzXCIgKSxcblx0ZXZlbnRMaXN0ZW5lcnM6IHtcblx0XHRuZXdGc206IFtdXG5cdH1cbn0gKTtcblxuXG5cbi8qKioqKioqKioqKioqKioqKlxuICoqIFdFQlBBQ0sgRk9PVEVSXG4gKiogLi9zcmMvbWFjaGluYS5qc1xuICoqIG1vZHVsZSBpZCA9IDBcbiAqKiBtb2R1bGUgY2h1bmtzID0gMFxuICoqLyIsIm1vZHVsZS5leHBvcnRzID0gX19XRUJQQUNLX0VYVEVSTkFMX01PRFVMRV8xX187XG5cblxuLyoqKioqKioqKioqKioqKioqXG4gKiogV0VCUEFDSyBGT09URVJcbiAqKiBleHRlcm5hbCB7XCJyb290XCI6XCJfXCIsXCJjb21tb25qc1wiOlwibG9kYXNoXCIsXCJjb21tb25qczJcIjpcImxvZGFzaFwiLFwiYW1kXCI6XCJsb2Rhc2hcIn1cbiAqKiBtb2R1bGUgaWQgPSAxXG4gKiogbW9kdWxlIGNodW5rcyA9IDBcbiAqKi8iLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCBcIi4vdXRpbHNcIiApO1xuXG5mdW5jdGlvbiBnZXRJbnN0YW5jZSgpIHtcblx0cmV0dXJuIHtcblx0XHRlbWl0OiBmdW5jdGlvbiggZXZlbnROYW1lICkge1xuXHRcdFx0dmFyIGFyZ3MgPSB1dGlscy5nZXRMZWFrbGVzc0FyZ3MoIGFyZ3VtZW50cyApO1xuXHRcdFx0aWYgKCB0aGlzLmV2ZW50TGlzdGVuZXJzWyBcIipcIiBdICkge1xuXHRcdFx0XHRfLmVhY2goIHRoaXMuZXZlbnRMaXN0ZW5lcnNbIFwiKlwiIF0sIGZ1bmN0aW9uKCBjYWxsYmFjayApIHtcblx0XHRcdFx0XHRpZiAoICF0aGlzLnVzZVNhZmVFbWl0ICkge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2suYXBwbHkoIHRoaXMsIGFyZ3MgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y2FsbGJhY2suYXBwbHkoIHRoaXMsIGFyZ3MgKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKCBleGNlcHRpb24gKSB7XG5cdFx0XHRcdFx0XHRcdC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICAqL1xuXHRcdFx0XHRcdFx0XHRpZiAoIGNvbnNvbGUgJiYgdHlwZW9mIGNvbnNvbGUubG9nICE9PSBcInVuZGVmaW5lZFwiICkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKCBleGNlcHRpb24uc3RhY2sgKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdGhpcyApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCB0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSApIHtcblx0XHRcdFx0Xy5lYWNoKCB0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSwgZnVuY3Rpb24oIGNhbGxiYWNrICkge1xuXHRcdFx0XHRcdGlmICggIXRoaXMudXNlU2FmZUVtaXQgKSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSggdGhpcywgYXJncy5zbGljZSggMSApICk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNhbGxiYWNrLmFwcGx5KCB0aGlzLCBhcmdzLnNsaWNlKCAxICkgKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKCBleGNlcHRpb24gKSB7XG5cdFx0XHRcdFx0XHRcdC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICAqL1xuXHRcdFx0XHRcdFx0XHRpZiAoIGNvbnNvbGUgJiYgdHlwZW9mIGNvbnNvbGUubG9nICE9PSBcInVuZGVmaW5lZFwiICkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKCBleGNlcHRpb24uc3RhY2sgKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdGhpcyApO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRvbjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgY2FsbGJhY2sgKSB7XG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XHRzZWxmLmV2ZW50TGlzdGVuZXJzID0gc2VsZi5ldmVudExpc3RlbmVycyB8fCB7IFwiKlwiOiBbXSB9O1xuXHRcdFx0aWYgKCAhc2VsZi5ldmVudExpc3RlbmVyc1sgZXZlbnROYW1lIF0gKSB7XG5cdFx0XHRcdHNlbGYuZXZlbnRMaXN0ZW5lcnNbIGV2ZW50TmFtZSBdID0gW107XG5cdFx0XHR9XG5cdFx0XHRzZWxmLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXS5wdXNoKCBjYWxsYmFjayApO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXZlbnROYW1lOiBldmVudE5hbWUsXG5cdFx0XHRcdGNhbGxiYWNrOiBjYWxsYmFjayxcblx0XHRcdFx0b2ZmOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRzZWxmLm9mZiggZXZlbnROYW1lLCBjYWxsYmFjayApO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0sXG5cblx0XHRvZmY6IGZ1bmN0aW9uKCBldmVudE5hbWUsIGNhbGxiYWNrICkge1xuXHRcdFx0dGhpcy5ldmVudExpc3RlbmVycyA9IHRoaXMuZXZlbnRMaXN0ZW5lcnMgfHwgeyBcIipcIjogW10gfTtcblx0XHRcdGlmICggIWV2ZW50TmFtZSApIHtcblx0XHRcdFx0dGhpcy5ldmVudExpc3RlbmVycyA9IHt9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCBjYWxsYmFjayApIHtcblx0XHRcdFx0XHR0aGlzLmV2ZW50TGlzdGVuZXJzWyBldmVudE5hbWUgXSA9IF8ud2l0aG91dCggdGhpcy5ldmVudExpc3RlbmVyc1sgZXZlbnROYW1lIF0sIGNhbGxiYWNrICk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ldmVudExpc3RlbmVyc1sgZXZlbnROYW1lIF0gPSBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG5cdGdldEluc3RhbmNlOiBnZXRJbnN0YW5jZSxcblx0aW5zdGFuY2U6IGdldEluc3RhbmNlKClcbn07XG5cblxuXG4vKioqKioqKioqKioqKioqKipcbiAqKiBXRUJQQUNLIEZPT1RFUlxuICoqIC4vc3JjL2VtaXR0ZXIuanNcbiAqKiBtb2R1bGUgaWQgPSAyXG4gKiogbW9kdWxlIGNodW5rcyA9IDBcbiAqKi8iLCJ2YXIgc2xpY2UgPSBbXS5zbGljZTtcbnZhciBldmVudHMgPSByZXF1aXJlKCBcIi4vZXZlbnRzLmpzXCIgKTtcbnZhciBfID0gcmVxdWlyZSggXCJsb2Rhc2hcIiApO1xuXG52YXIgbWFrZUZzbU5hbWVzcGFjZSA9ICggZnVuY3Rpb24oKSB7XG5cdHZhciBtYWNoaW5hQ291bnQgPSAwO1xuXHRyZXR1cm4gZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIFwiZnNtLlwiICsgbWFjaGluYUNvdW50Kys7XG5cdH07XG59ICkoKTtcblxuZnVuY3Rpb24gZ2V0RGVmYXVsdEJlaGF2aW9yYWxPcHRpb25zKCkge1xuXHRyZXR1cm4ge1xuXHRcdGluaXRpYWxTdGF0ZTogXCJ1bmluaXRpYWxpemVkXCIsXG5cdFx0ZXZlbnRMaXN0ZW5lcnM6IHtcblx0XHRcdFwiKlwiOiBbXVxuXHRcdH0sXG5cdFx0c3RhdGVzOiB7fSxcblx0XHRuYW1lc3BhY2U6IG1ha2VGc21OYW1lc3BhY2UoKSxcblx0XHR1c2VTYWZlRW1pdDogZmFsc2UsXG5cdFx0aGllcmFyY2h5OiB7fSxcblx0XHRwZW5kaW5nRGVsZWdhdGlvbnM6IHt9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRDbGllbnRNZXRhKCkge1xuXHRyZXR1cm4ge1xuXHRcdGlucHV0UXVldWU6IFtdLFxuXHRcdHRhcmdldFJlcGxheVN0YXRlOiBcIlwiLFxuXHRcdHN0YXRlOiB1bmRlZmluZWQsXG5cdFx0cHJpb3JTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdHByaW9yQWN0aW9uOiBcIlwiLFxuXHRcdGN1cnJlbnRBY3Rpb246IFwiXCIsXG5cdFx0Y3VycmVudEFjdGlvbkFyZ3M6IHVuZGVmaW5lZCxcblx0XHRpbkV4aXRIYW5kbGVyOiBmYWxzZVxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRMZWFrbGVzc0FyZ3MoIGFyZ3MsIHN0YXJ0SWR4ICkge1xuXHR2YXIgcmVzdWx0ID0gW107XG5cdGZvciAoIHZhciBpID0gKCBzdGFydElkeCB8fCAwICk7IGkgPCBhcmdzLmxlbmd0aDsgaSsrICkge1xuXHRcdHJlc3VsdFsgaSBdID0gYXJnc1sgaSBdO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG4vKlxuXHRoYW5kbGUgLT5cblx0XHRjaGlsZCA9IHN0YXRlT2JqLl9jaGlsZCAmJiBzdGF0ZU9iai5fY2hpbGQuaW5zdGFuY2U7XG5cblx0dHJhbnNpdGlvbiAtPlxuXHRcdG5ld1N0YXRlT2JqLl9jaGlsZCA9IGdldENoaWxkRnNtSW5zdGFuY2UoIG5ld1N0YXRlT2JqLl9jaGlsZCApO1xuXHRcdGNoaWxkID0gbmV3U3RhdGVPYmouX2NoaWxkICYmIG5ld1N0YXRlT2JqLl9jaGlsZC5pbnN0YW5jZTtcbiovXG5mdW5jdGlvbiBnZXRDaGlsZEZzbUluc3RhbmNlKCBjb25maWcgKSB7XG5cdGlmICggIWNvbmZpZyApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0dmFyIGNoaWxkRnNtRGVmaW5pdGlvbiA9IHt9O1xuXHRpZiAoIHR5cGVvZiBjb25maWcgPT09IFwib2JqZWN0XCIgKSB7XG5cdFx0Ly8gaXMgdGhpcyBhIGNvbmZpZyBvYmplY3Qgd2l0aCBhIGZhY3Rvcnk/XG5cdFx0aWYgKCBjb25maWcuZmFjdG9yeSApIHtcblx0XHRcdGNoaWxkRnNtRGVmaW5pdGlvbiA9IGNvbmZpZztcblx0XHRcdGNoaWxkRnNtRGVmaW5pdGlvbi5pbnN0YW5jZSA9IGNoaWxkRnNtRGVmaW5pdGlvbi5mYWN0b3J5KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGFzc3VtaW5nIHRoaXMgaXMgYSBtYWNoaW5hIGluc3RhbmNlXG5cdFx0XHRjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdFx0fTtcblx0XHR9XG5cdH0gZWxzZSBpZiAoIHR5cGVvZiBjb25maWcgPT09IFwiZnVuY3Rpb25cIiApIHtcblx0XHRjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSA9IGNvbmZpZztcblx0fVxuXHRjaGlsZEZzbURlZmluaXRpb24uaW5zdGFuY2UgPSBjaGlsZEZzbURlZmluaXRpb24uZmFjdG9yeSgpO1xuXHRyZXR1cm4gY2hpbGRGc21EZWZpbml0aW9uO1xufVxuXG5mdW5jdGlvbiBsaXN0ZW5Ub0NoaWxkKCBmc20sIGNoaWxkICkge1xuXHQvLyBOZWVkIHRvIGludmVzdGlnYXRlIHBvdGVudGlhbCBmb3IgZGlzY2FyZGVkIGV2ZW50XG5cdC8vIGxpc3RlbmVyIG1lbW9yeSBsZWFrIGluIGxvbmctcnVubmluZywgZGVlcGx5LW5lc3RlZCBoaWVyYXJjaGllcy5cblx0cmV0dXJuIGNoaWxkLm9uKCBcIipcIiwgZnVuY3Rpb24oIGV2ZW50TmFtZSwgZGF0YSApIHtcblx0XHRzd2l0Y2ggKCBldmVudE5hbWUgKSB7XG5cdFx0XHRjYXNlIGV2ZW50cy5OT19IQU5ETEVSOlxuXHRcdFx0XHRpZiAoICFkYXRhLnRpY2tldCAmJiAhZGF0YS5kZWxlZ2F0ZWQgJiYgZGF0YS5uYW1lc3BhY2UgIT09IGZzbS5uYW1lc3BhY2UgKSB7XG5cdFx0XHRcdFx0Ly8gT2sgLSB3ZSdyZSBkZWFsaW5nIHcvIGEgY2hpbGQgaGFuZGxpbmcgaW5wdXQgdGhhdCBzaG91bGQgYnViYmxlIHVwXG5cdFx0XHRcdFx0ZGF0YS5hcmdzWyAxIF0uYnViYmxpbmcgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIHdlIGRvIE5PVCBidWJibGUgX3Jlc2V0IGlucHV0cyB1cCB0byB0aGUgcGFyZW50XG5cdFx0XHRcdGlmICggZGF0YS5pbnB1dFR5cGUgIT09IFwiX3Jlc2V0XCIgKSB7XG5cdFx0XHRcdFx0ZnNtLmhhbmRsZS5hcHBseSggZnNtLCBkYXRhLmFyZ3MgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgZXZlbnRzLkhBTkRMSU5HIDpcblx0XHRcdFx0dmFyIHRpY2tldCA9IGRhdGEudGlja2V0O1xuXHRcdFx0XHRpZiAoIHRpY2tldCAmJiBmc20ucGVuZGluZ0RlbGVnYXRpb25zWyB0aWNrZXQgXSApIHtcblx0XHRcdFx0XHRkZWxldGUgZnNtLnBlbmRpbmdEZWxlZ2F0aW9uc1sgdGlja2V0IF07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZnNtLmVtaXQoIGV2ZW50TmFtZSwgZGF0YSApOyAvLyBwb3NzaWJseSB0cmFuc2Zvcm0gcGF5bG9hZD9cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRmc20uZW1pdCggZXZlbnROYW1lLCBkYXRhICk7IC8vIHBvc3NpYmx5IHRyYW5zZm9ybSBwYXlsb2FkP1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0gKTtcbn1cblxuLy8gX21hY2hLZXlzIGFyZSBtZW1iZXJzIHdlIHdhbnQgdG8gdHJhY2sgYWNyb3NzIHRoZSBwcm90b3R5cGUgY2hhaW4gb2YgYW4gZXh0ZW5kZWQgRlNNIGNvbnN0cnVjdG9yXG4vLyBTaW5jZSB3ZSB3YW50IHRvIGV2ZW50dWFsbHkgbWVyZ2UgdGhlIGFnZ3JlZ2F0ZSBvZiB0aG9zZSB2YWx1ZXMgb250byB0aGUgaW5zdGFuY2Ugc28gdGhhdCBGU01zXG4vLyB0aGF0IHNoYXJlIHRoZSBzYW1lIGV4dGVuZGVkIHByb3RvdHlwZSB3b24ndCBzaGFyZSBzdGF0ZSAqb24qIHRob3NlIHByb3RvdHlwZXMuXG52YXIgX21hY2hLZXlzID0gWyBcInN0YXRlc1wiLCBcImluaXRpYWxTdGF0ZVwiIF07XG52YXIgZXh0ZW5kID0gZnVuY3Rpb24oIHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzICkge1xuXHR2YXIgcGFyZW50ID0gdGhpcztcblx0dmFyIGZzbTsgLy8gcGxhY2Vob2xkZXIgZm9yIGluc3RhbmNlIGNvbnN0cnVjdG9yXG5cdHZhciBtYWNoT2JqID0ge307IC8vIG9iamVjdCB1c2VkIHRvIGhvbGQgaW5pdGlhbFN0YXRlICYgc3RhdGVzIGZyb20gcHJvdG90eXBlIGZvciBpbnN0YW5jZS1sZXZlbCBtZXJnaW5nXG5cdHZhciBDdG9yID0gZnVuY3Rpb24oKSB7fTsgLy8gcGxhY2Vob2xkZXIgY3RvciBmdW5jdGlvbiB1c2VkIHRvIGluc2VydCBsZXZlbCBpbiBwcm90b3R5cGUgY2hhaW5cblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmICggcHJvdG9Qcm9wcyAmJiBwcm90b1Byb3BzLmhhc093blByb3BlcnR5KCBcImNvbnN0cnVjdG9yXCIgKSApIHtcblx0XHRmc20gPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdC8vIFRoZSBkZWZhdWx0IG1hY2hpbmEgY29uc3RydWN0b3IgKHdoZW4gdXNpbmcgaW5oZXJpdGFuY2UpIGNyZWF0ZXMgYVxuXHRcdC8vIGRlZXAgY29weSBvZiB0aGUgc3RhdGVzL2luaXRpYWxTdGF0ZSB2YWx1ZXMgZnJvbSB0aGUgcHJvdG90eXBlIGFuZFxuXHRcdC8vIGV4dGVuZHMgdGhlbSBvdmVyIHRoZSBpbnN0YW5jZSBzbyB0aGF0IHRoZXknbGwgYmUgaW5zdGFuY2UtbGV2ZWwuXG5cdFx0Ly8gSWYgYW4gb3B0aW9ucyBhcmcgKGFyZ3NbMF0pIGlzIHBhc3NlZCBpbiwgYSBzdGF0ZXMgb3IgaW50aWFsU3RhdGVcblx0XHQvLyB2YWx1ZSB3aWxsIGJlIHByZWZlcnJlZCBvdmVyIGFueSBkYXRhIHB1bGxlZCB1cCBmcm9tIHRoZSBwcm90b3R5cGUuXG5cdFx0ZnNtID0gZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgYXJncyA9IHNsaWNlLmNhbGwoIGFyZ3VtZW50cywgMCApO1xuXHRcdFx0YXJnc1sgMCBdID0gYXJnc1sgMCBdIHx8IHt9O1xuXHRcdFx0dmFyIGJsZW5kZWRTdGF0ZTtcblx0XHRcdHZhciBpbnN0YW5jZVN0YXRlcyA9IGFyZ3NbIDAgXS5zdGF0ZXMgfHwge307XG5cdFx0XHRibGVuZGVkU3RhdGUgPSBfLm1lcmdlKCBfLmNsb25lRGVlcCggbWFjaE9iaiApLCB7IHN0YXRlczogaW5zdGFuY2VTdGF0ZXMgfSApO1xuXHRcdFx0YmxlbmRlZFN0YXRlLmluaXRpYWxTdGF0ZSA9IGFyZ3NbIDAgXS5pbml0aWFsU3RhdGUgfHwgdGhpcy5pbml0aWFsU3RhdGU7XG5cdFx0XHRfLmV4dGVuZCggYXJnc1sgMCBdLCBibGVuZGVkU3RhdGUgKTtcblx0XHRcdHBhcmVudC5hcHBseSggdGhpcywgYXJncyApO1xuXHRcdH07XG5cdH1cblxuXHQvLyBJbmhlcml0IGNsYXNzIChzdGF0aWMpIHByb3BlcnRpZXMgZnJvbSBwYXJlbnQuXG5cdF8ubWVyZ2UoIGZzbSwgcGFyZW50ICk7XG5cblx0Ly8gU2V0IHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gaW5oZXJpdCBmcm9tIGBwYXJlbnRgLCB3aXRob3V0IGNhbGxpbmdcblx0Ly8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cblx0Q3Rvci5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXHRmc20ucHJvdG90eXBlID0gbmV3IEN0b3IoKTtcblxuXHQvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcblx0Ly8gaWYgc3VwcGxpZWQuXG5cdGlmICggcHJvdG9Qcm9wcyApIHtcblx0XHRfLmV4dGVuZCggZnNtLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyApO1xuXHRcdF8ubWVyZ2UoIG1hY2hPYmosIF8udHJhbnNmb3JtKCBwcm90b1Byb3BzLCBmdW5jdGlvbiggYWNjdW0sIHZhbCwga2V5ICkge1xuXHRcdFx0aWYgKCBfbWFjaEtleXMuaW5kZXhPZigga2V5ICkgIT09IC0xICkge1xuXHRcdFx0XHRhY2N1bVsga2V5IF0gPSB2YWw7XG5cdFx0XHR9XG5cdFx0fSApICk7XG5cdH1cblxuXHQvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cblx0aWYgKCBzdGF0aWNQcm9wcyApIHtcblx0XHRfLm1lcmdlKCBmc20sIHN0YXRpY1Byb3BzICk7XG5cdH1cblxuXHQvLyBDb3JyZWN0bHkgc2V0IGNoaWxkJ3MgYHByb3RvdHlwZS5jb25zdHJ1Y3RvcmAuXG5cdGZzbS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBmc207XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZCBsYXRlci5cblx0ZnNtLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cdHJldHVybiBmc207XG59O1xuXG5mdW5jdGlvbiBjcmVhdGVVVUlEKCkge1xuXHR2YXIgcyA9IFtdO1xuXHR2YXIgaGV4RGlnaXRzID0gXCIwMTIzNDU2Nzg5YWJjZGVmXCI7XG5cdGZvciAoIHZhciBpID0gMDsgaSA8IDM2OyBpKysgKSB7XG5cdFx0c1sgaSBdID0gaGV4RGlnaXRzLnN1YnN0ciggTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIDB4MTAgKSwgMSApO1xuXHR9XG5cdHNbIDE0IF0gPSBcIjRcIjsgLy8gYml0cyAxMi0xNSBvZiB0aGUgdGltZV9oaV9hbmRfdmVyc2lvbiBmaWVsZCB0byAwMDEwXG5cdC8qIGpzaGludCBpZ25vcmU6c3RhcnQgKi9cblx0c1sgMTkgXSA9IGhleERpZ2l0cy5zdWJzdHIoICggc1sgMTkgXSAmIDB4MyApIHwgMHg4LCAxICk7IC8vIGJpdHMgNi03IG9mIHRoZSBjbG9ja19zZXFfaGlfYW5kX3Jlc2VydmVkIHRvIDAxXG5cdC8qIGpzaGludCBpZ25vcmU6ZW5kICovXG5cdHNbIDggXSA9IHNbIDEzIF0gPSBzWyAxOCBdID0gc1sgMjMgXSA9IFwiLVwiO1xuXHRyZXR1cm4gcy5qb2luKCBcIlwiICk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRjcmVhdGVVVUlEOiBjcmVhdGVVVUlELFxuXHRleHRlbmQ6IGV4dGVuZCxcblx0Z2V0RGVmYXVsdEJlaGF2aW9yYWxPcHRpb25zOiBnZXREZWZhdWx0QmVoYXZpb3JhbE9wdGlvbnMsXG5cdGdldERlZmF1bHRPcHRpb25zOiBnZXREZWZhdWx0QmVoYXZpb3JhbE9wdGlvbnMsXG5cdGdldERlZmF1bHRDbGllbnRNZXRhOiBnZXREZWZhdWx0Q2xpZW50TWV0YSxcblx0Z2V0Q2hpbGRGc21JbnN0YW5jZTogZ2V0Q2hpbGRGc21JbnN0YW5jZSxcblx0Z2V0TGVha2xlc3NBcmdzOiBnZXRMZWFrbGVzc0FyZ3MsXG5cdGxpc3RlblRvQ2hpbGQ6IGxpc3RlblRvQ2hpbGQsXG5cdG1ha2VGc21OYW1lc3BhY2U6IG1ha2VGc21OYW1lc3BhY2Vcbn07XG5cblxuXG4vKioqKioqKioqKioqKioqKipcbiAqKiBXRUJQQUNLIEZPT1RFUlxuICoqIC4vc3JjL3V0aWxzLmpzXG4gKiogbW9kdWxlIGlkID0gM1xuICoqIG1vZHVsZSBjaHVua3MgPSAwXG4gKiovIiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdE5FWFRfVFJBTlNJVElPTjogXCJ0cmFuc2l0aW9uXCIsXG5cdEhBTkRMSU5HOiBcImhhbmRsaW5nXCIsXG5cdEhBTkRMRUQ6IFwiaGFuZGxlZFwiLFxuXHROT19IQU5ETEVSOiBcIm5vaGFuZGxlclwiLFxuXHRUUkFOU0lUSU9OOiBcInRyYW5zaXRpb25cIixcblx0SU5WQUxJRF9TVEFURTogXCJpbnZhbGlkc3RhdGVcIixcblx0REVGRVJSRUQ6IFwiZGVmZXJyZWRcIixcblx0TkVXX0ZTTTogXCJuZXdmc21cIlxufTtcblxuXG5cbi8qKioqKioqKioqKioqKioqKlxuICoqIFdFQlBBQ0sgRk9PVEVSXG4gKiogLi9zcmMvZXZlbnRzLmpzXG4gKiogbW9kdWxlIGlkID0gNFxuICoqIG1vZHVsZSBjaHVua3MgPSAwXG4gKiovIiwidmFyIEJlaGF2aW9yYWxGc20gPSByZXF1aXJlKCBcIi4vQmVoYXZpb3JhbEZzbVwiICk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCBcIi4vdXRpbHNcIiApO1xudmFyIF8gPSByZXF1aXJlKCBcImxvZGFzaFwiICk7XG5cbnZhciBGc20gPSB7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHRCZWhhdmlvcmFsRnNtLmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTtcblx0XHR0aGlzLmVuc3VyZUNsaWVudE1ldGEoKTtcblx0fSxcblx0aW5pdENsaWVudDogZnVuY3Rpb24gaW5pdENsaWVudCgpIHtcblx0XHR2YXIgaW5pdGlhbFN0YXRlID0gdGhpcy5pbml0aWFsU3RhdGU7XG5cdFx0aWYgKCAhaW5pdGlhbFN0YXRlICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIllvdSBtdXN0IHNwZWNpZnkgYW4gaW5pdGlhbCBzdGF0ZSBmb3IgdGhpcyBGU01cIiApO1xuXHRcdH1cblx0XHRpZiAoICF0aGlzLnN0YXRlc1sgaW5pdGlhbFN0YXRlIF0gKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoIFwiVGhlIGluaXRpYWwgc3RhdGUgc3BlY2lmaWVkIGRvZXMgbm90IGV4aXN0IGluIHRoZSBzdGF0ZXMgb2JqZWN0LlwiICk7XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNpdGlvbiggaW5pdGlhbFN0YXRlICk7XG5cdH0sXG5cdGVuc3VyZUNsaWVudE1ldGE6IGZ1bmN0aW9uIGVuc3VyZUNsaWVudE1ldGEoKSB7XG5cdFx0aWYgKCAhdGhpcy5fc3RhbXBlZCApIHtcblx0XHRcdHRoaXMuX3N0YW1wZWQgPSB0cnVlO1xuXHRcdFx0Xy5kZWZhdWx0cyggdGhpcywgXy5jbG9uZURlZXAoIHV0aWxzLmdldERlZmF1bHRDbGllbnRNZXRhKCkgKSApO1xuXHRcdFx0dGhpcy5pbml0Q2xpZW50KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGVuc3VyZUNsaWVudEFyZzogZnVuY3Rpb24oIGFyZ3MgKSB7XG5cdFx0dmFyIF9hcmdzID0gYXJncztcblx0XHQvLyB3ZSBuZWVkIHRvIHRlc3QgdGhlIGFyZ3MgYW5kIHZlcmlmeSB0aGF0IGlmIGEgY2xpZW50IGFyZyBoYXNcblx0XHQvLyBiZWVuIHBhc3NlZCwgaXQgbXVzdCBiZSB0aGlzIEZTTSBpbnN0YW5jZSAodGhpcyBpc24ndCBhIGJlaGF2aW9yYWwgRlNNKVxuXHRcdGlmICggdHlwZW9mIF9hcmdzWyAwIF0gPT09IFwib2JqZWN0XCIgJiYgISggXCJpbnB1dFR5cGVcIiBpbiBfYXJnc1sgMCBdICkgJiYgX2FyZ3NbIDAgXSAhPT0gdGhpcyApIHtcblx0XHRcdF9hcmdzLnNwbGljZSggMCwgMSwgdGhpcyApO1xuXHRcdH0gZWxzZSBpZiAoIHR5cGVvZiBfYXJnc1sgMCBdICE9PSBcIm9iamVjdFwiIHx8ICggdHlwZW9mIF9hcmdzWyAwIF0gPT09IFwib2JqZWN0XCIgJiYgKCBcImlucHV0VHlwZVwiIGluIF9hcmdzWyAwIF0gKSApICkge1xuXHRcdFx0X2FyZ3MudW5zaGlmdCggdGhpcyApO1xuXHRcdH1cblx0XHRyZXR1cm4gX2FyZ3M7XG5cdH0sXG5cblx0Z2V0SGFuZGxlckFyZ3M6IGZ1bmN0aW9uKCBhcmdzLCBpc0NhdGNoQWxsICkge1xuXHRcdC8vIGluZGV4IDAgaXMgdGhlIGNsaWVudCwgaW5kZXggMSBpcyBpbnB1dFR5cGVcblx0XHQvLyBpZiB3ZSdyZSBpbiBhIGNhdGNoLWFsbCBoYW5kbGVyLCBpbnB1dCB0eXBlIG5lZWRzIHRvIGJlIGluY2x1ZGVkIGluIHRoZSBhcmdzXG5cdFx0Ly8gaW5wdXRUeXBlIG1pZ2h0IGJlIGFuIG9iamVjdCwgc28gd2UgbmVlZCB0byBqdXN0IGdldCB0aGUgaW5wdXRUeXBlIHN0cmluZyBpZiBzb1xuXHRcdHZhciBfYXJncyA9IGFyZ3M7XG5cdFx0dmFyIGlucHV0ID0gX2FyZ3NbIDEgXTtcblx0XHRpZiAoIHR5cGVvZiBpbnB1dFR5cGUgPT09IFwib2JqZWN0XCIgKSB7XG5cdFx0XHRfYXJncy5zcGxpY2UoIDEsIDEsIGlucHV0LmlucHV0VHlwZSApO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNDYXRjaEFsbCA/XG5cdFx0XHRfYXJncy5zbGljZSggMSApIDpcblx0XHRcdF9hcmdzLnNsaWNlKCAyICk7XG5cdH0sXG5cdC8vIFwiY2xhc3NpY1wiIG1hY2hpbmEgRlNNIGRvIG5vdCBlbWl0IHRoZSBjbGllbnQgcHJvcGVydHkgb24gZXZlbnRzICh3aGljaCB3b3VsZCBiZSB0aGUgRlNNIGl0c2VsZilcblx0YnVpbGRFdmVudFBheWxvYWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gdGhpcy5lbnN1cmVDbGllbnRBcmcoIHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICkgKTtcblx0XHR2YXIgZGF0YSA9IGFyZ3NbIDEgXTtcblx0XHRpZiAoIF8uaXNQbGFpbk9iamVjdCggZGF0YSApICkge1xuXHRcdFx0cmV0dXJuIF8uZXh0ZW5kKCBkYXRhLCB7IG5hbWVzcGFjZTogdGhpcy5uYW1lc3BhY2UgfSApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBkYXRhIHx8IG51bGwsIG5hbWVzcGFjZTogdGhpcy5uYW1lc3BhY2UgfTtcblx0XHR9XG5cdH1cbn07XG5cbl8uZWFjaCggW1xuXHRcImhhbmRsZVwiLFxuXHRcInRyYW5zaXRpb25cIixcblx0XCJkZWZlclVudGlsVHJhbnNpdGlvblwiLFxuXHRcInByb2Nlc3NRdWV1ZVwiLFxuXHRcImNsZWFyUXVldWVcIlxuXSwgZnVuY3Rpb24oIG1ldGhvZFdpdGhDbGllbnRJbmplY3RlZCApIHtcblx0RnNtWyBtZXRob2RXaXRoQ2xpZW50SW5qZWN0ZWQgXSA9IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gdGhpcy5lbnN1cmVDbGllbnRBcmcoIHV0aWxzLmdldExlYWtsZXNzQXJncyggYXJndW1lbnRzICkgKTtcblx0XHRyZXR1cm4gQmVoYXZpb3JhbEZzbS5wcm90b3R5cGVbIG1ldGhvZFdpdGhDbGllbnRJbmplY3RlZCBdLmFwcGx5KCB0aGlzLCBhcmdzICk7XG5cdH07XG59ICk7XG5cbkZzbSA9IEJlaGF2aW9yYWxGc20uZXh0ZW5kKCBGc20gKTtcblxubW9kdWxlLmV4cG9ydHMgPSBGc207XG5cblxuXG4vKioqKioqKioqKioqKioqKipcbiAqKiBXRUJQQUNLIEZPT1RFUlxuICoqIC4vc3JjL0ZzbS5qc1xuICoqIG1vZHVsZSBpZCA9IDVcbiAqKiBtb2R1bGUgY2h1bmtzID0gMFxuICoqLyIsInZhciBfID0gcmVxdWlyZSggXCJsb2Rhc2hcIiApO1xudmFyIHV0aWxzID0gcmVxdWlyZSggXCIuL3V0aWxzXCIgKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSggXCIuL2VtaXR0ZXJcIiApO1xudmFyIHRvcExldmVsRW1pdHRlciA9IGVtaXR0ZXIuaW5zdGFuY2U7XG52YXIgZXZlbnRzID0gcmVxdWlyZSggXCIuL2V2ZW50c1wiICk7XG5cbnZhciBNQUNISU5BX1BST1AgPSBcIl9fbWFjaGluYV9fXCI7XG5cbmZ1bmN0aW9uIEJlaGF2aW9yYWxGc20oIG9wdGlvbnMgKSB7XG5cdF8uZXh0ZW5kKCB0aGlzLCBvcHRpb25zICk7XG5cdF8uZGVmYXVsdHMoIHRoaXMsIHV0aWxzLmdldERlZmF1bHRCZWhhdmlvcmFsT3B0aW9ucygpICk7XG5cdHRoaXMuaW5pdGlhbGl6ZS5hcHBseSggdGhpcywgYXJndW1lbnRzICk7XG5cdHRvcExldmVsRW1pdHRlci5lbWl0KCBldmVudHMuTkVXX0ZTTSwgdGhpcyApO1xufVxuXG5fLmV4dGVuZCggQmVoYXZpb3JhbEZzbS5wcm90b3R5cGUsIHtcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7fSxcblxuXHRpbml0Q2xpZW50OiBmdW5jdGlvbiBpbml0Q2xpZW50KCBjbGllbnQgKSB7XG5cdFx0dmFyIGluaXRpYWxTdGF0ZSA9IHRoaXMuaW5pdGlhbFN0YXRlO1xuXHRcdGlmICggIWluaXRpYWxTdGF0ZSApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvciggXCJZb3UgbXVzdCBzcGVjaWZ5IGFuIGluaXRpYWwgc3RhdGUgZm9yIHRoaXMgRlNNXCIgKTtcblx0XHR9XG5cdFx0aWYgKCAhdGhpcy5zdGF0ZXNbIGluaXRpYWxTdGF0ZSBdICkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCBcIlRoZSBpbml0aWFsIHN0YXRlIHNwZWNpZmllZCBkb2VzIG5vdCBleGlzdCBpbiB0aGUgc3RhdGVzIG9iamVjdC5cIiApO1xuXHRcdH1cblx0XHR0aGlzLnRyYW5zaXRpb24oIGNsaWVudCwgaW5pdGlhbFN0YXRlICk7XG5cdH0sXG5cblx0Y29uZmlnRm9yU3RhdGU6IGZ1bmN0aW9uIGNvbmZpZ0ZvclN0YXRlKCBuZXdTdGF0ZSApIHtcblx0XHR2YXIgbmV3U3RhdGVPYmogPSB0aGlzLnN0YXRlc1sgbmV3U3RhdGUgXTtcblx0XHR2YXIgY2hpbGQ7XG5cdFx0Xy5lYWNoKCB0aGlzLmhpZXJhcmNoeSwgZnVuY3Rpb24oIGNoaWxkTGlzdGVuZXIsIGtleSApIHtcblx0XHRcdGlmICggY2hpbGRMaXN0ZW5lciAmJiB0eXBlb2YgY2hpbGRMaXN0ZW5lci5vZmYgPT09IFwiZnVuY3Rpb25cIiApIHtcblx0XHRcdFx0Y2hpbGRMaXN0ZW5lci5vZmYoKTtcblx0XHRcdH1cblx0XHR9ICk7XG5cblx0XHRpZiAoIG5ld1N0YXRlT2JqLl9jaGlsZCApIHtcblx0XHRcdG5ld1N0YXRlT2JqLl9jaGlsZCA9IHV0aWxzLmdldENoaWxkRnNtSW5zdGFuY2UoIG5ld1N0YXRlT2JqLl9jaGlsZCApO1xuXHRcdFx0Y2hpbGQgPSBuZXdTdGF0ZU9iai5fY2hpbGQgJiYgbmV3U3RhdGVPYmouX2NoaWxkLmluc3RhbmNlO1xuXHRcdFx0dGhpcy5oaWVyYXJjaHlbIGNoaWxkLm5hbWVzcGFjZSBdID0gdXRpbHMubGlzdGVuVG9DaGlsZCggdGhpcywgY2hpbGQgKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGQ7XG5cdH0sXG5cblx0ZW5zdXJlQ2xpZW50TWV0YTogZnVuY3Rpb24gZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICkge1xuXHRcdGlmICggdHlwZW9mIGNsaWVudCAhPT0gXCJvYmplY3RcIiApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvciggXCJBbiBGU00gY2xpZW50IG11c3QgYmUgYW4gb2JqZWN0LlwiICk7XG5cdFx0fVxuXHRcdGNsaWVudFsgTUFDSElOQV9QUk9QIF0gPSBjbGllbnRbIE1BQ0hJTkFfUFJPUCBdIHx8IHt9O1xuXHRcdGlmICggIWNsaWVudFsgTUFDSElOQV9QUk9QIF1bIHRoaXMubmFtZXNwYWNlIF0gKSB7XG5cdFx0XHRjbGllbnRbIE1BQ0hJTkFfUFJPUCBdWyB0aGlzLm5hbWVzcGFjZSBdID0gXy5jbG9uZURlZXAoIHV0aWxzLmdldERlZmF1bHRDbGllbnRNZXRhKCkgKTtcblx0XHRcdHRoaXMuaW5pdENsaWVudCggY2xpZW50ICk7XG5cdFx0fVxuXHRcdHJldHVybiBjbGllbnRbIE1BQ0hJTkFfUFJPUCBdWyB0aGlzLm5hbWVzcGFjZSBdO1xuXHR9LFxuXG5cdGJ1aWxkRXZlbnRQYXlsb2FkOiBmdW5jdGlvbiggY2xpZW50LCBkYXRhICkge1xuXHRcdGlmICggXy5pc1BsYWluT2JqZWN0KCBkYXRhICkgKSB7XG5cdFx0XHRyZXR1cm4gXy5leHRlbmQoIGRhdGEsIHsgY2xpZW50OiBjbGllbnQsIG5hbWVzcGFjZTogdGhpcy5uYW1lc3BhY2UgfSApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBjbGllbnQ6IGNsaWVudCwgZGF0YTogZGF0YSB8fCBudWxsLCBuYW1lc3BhY2U6IHRoaXMubmFtZXNwYWNlIH07XG5cdFx0fVxuXHR9LFxuXG5cdGdldEhhbmRsZXJBcmdzOiBmdW5jdGlvbiggYXJncywgaXNDYXRjaEFsbCApIHtcblx0XHQvLyBpbmRleCAwIGlzIHRoZSBjbGllbnQsIGluZGV4IDEgaXMgaW5wdXRUeXBlXG5cdFx0Ly8gaWYgd2UncmUgaW4gYSBjYXRjaC1hbGwgaGFuZGxlciwgaW5wdXQgdHlwZSBuZWVkcyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgYXJnc1xuXHRcdC8vIGlucHV0VHlwZSBtaWdodCBiZSBhbiBvYmplY3QsIHNvIHdlIG5lZWQgdG8ganVzdCBnZXQgdGhlIGlucHV0VHlwZSBzdHJpbmcgaWYgc29cblx0XHR2YXIgX2FyZ3MgPSBhcmdzLnNsaWNlKCAwICk7XG5cdFx0dmFyIGlucHV0ID0gX2FyZ3NbIDEgXTtcblx0XHRpZiAoIHR5cGVvZiBpbnB1dCA9PT0gXCJvYmplY3RcIiApIHtcblx0XHRcdF9hcmdzLnNwbGljZSggMSwgMSwgaW5wdXQuaW5wdXRUeXBlICk7XG5cdFx0fVxuXHRcdHJldHVybiBpc0NhdGNoQWxsID9cblx0XHRcdF9hcmdzIDpcblx0XHRcdFsgX2FyZ3NbIDAgXSBdLmNvbmNhdCggX2FyZ3Muc2xpY2UoIDIgKSApO1xuXHR9LFxuXG5cdGhhbmRsZTogZnVuY3Rpb24oIGNsaWVudCwgaW5wdXQgKSB7XG5cdFx0dmFyIGlucHV0RGVmID0gaW5wdXQ7XG5cdFx0aWYgKCB0eXBlb2YgaW5wdXQgPT09IFwidW5kZWZpbmVkXCIgKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoIFwiVGhlIGlucHV0IGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgRlNNJ3MgaGFuZGxlIG1ldGhvZCBpcyB1bmRlZmluZWQuIERpZCB5b3UgZm9yZ2V0IHRvIHBhc3MgdGhlIGlucHV0IG5hbWU/XCIgKTtcblx0XHR9XG5cdFx0aWYgKCB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIgKSB7XG5cdFx0XHRpbnB1dERlZiA9IHsgaW5wdXRUeXBlOiBpbnB1dCwgZGVsZWdhdGVkOiBmYWxzZSwgdGlja2V0OiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdHZhciBhcmdzID0gdXRpbHMuZ2V0TGVha2xlc3NBcmdzKCBhcmd1bWVudHMgKTtcblx0XHRpZiAoIHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIiApIHtcblx0XHRcdGFyZ3Muc3BsaWNlKCAxLCAxLCBpbnB1dERlZiApO1xuXHRcdH1cblx0XHRjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb25BcmdzID0gYXJncy5zbGljZSggMSApO1xuXHRcdHZhciBjdXJyZW50U3RhdGUgPSBjbGllbnRNZXRhLnN0YXRlO1xuXHRcdHZhciBzdGF0ZU9iaiA9IHRoaXMuc3RhdGVzWyBjdXJyZW50U3RhdGUgXTtcblx0XHR2YXIgaGFuZGxlck5hbWU7XG5cdFx0dmFyIGhhbmRsZXI7XG5cdFx0dmFyIGlzQ2F0Y2hBbGwgPSBmYWxzZTtcblx0XHR2YXIgY2hpbGQ7XG5cdFx0dmFyIHJlc3VsdDtcblx0XHR2YXIgYWN0aW9uO1xuXHRcdGlmICggIWNsaWVudE1ldGEuaW5FeGl0SGFuZGxlciApIHtcblx0XHRcdGNoaWxkID0gdGhpcy5jb25maWdGb3JTdGF0ZSggY3VycmVudFN0YXRlICk7XG5cdFx0XHRpZiAoIGNoaWxkICYmICF0aGlzLnBlbmRpbmdEZWxlZ2F0aW9uc1sgaW5wdXREZWYudGlja2V0IF0gJiYgIWlucHV0RGVmLmJ1YmJsaW5nICkge1xuXHRcdFx0XHRpbnB1dERlZi50aWNrZXQgPSAoIGlucHV0RGVmLnRpY2tldCB8fCB1dGlscy5jcmVhdGVVVUlEKCkgKTtcblx0XHRcdFx0aW5wdXREZWYuZGVsZWdhdGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5wZW5kaW5nRGVsZWdhdGlvbnNbIGlucHV0RGVmLnRpY2tldCBdID0geyBkZWxlZ2F0ZWRUbzogY2hpbGQubmFtZXNwYWNlIH07XG5cdFx0XHRcdC8vIFdBUk5JTkcgLSByZXR1cm5pbmcgYSB2YWx1ZSBmcm9tIGBoYW5kbGVgIG9uIGNoaWxkIEZTTXMgaXMgbm90IHJlYWxseSBzdXBwb3J0ZWQuXG5cdFx0XHRcdC8vIElmIHlvdSBuZWVkIHRvIHJldHVybiB2YWx1ZXMgZnJvbSBjaGlsZCBGU00gaW5wdXQgaGFuZGxlcnMsIHVzZSBldmVudHMgaW5zdGVhZC5cblx0XHRcdFx0cmVzdWx0ID0gY2hpbGQuaGFuZGxlLmFwcGx5KCBjaGlsZCwgYXJncyApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCBpbnB1dERlZi50aWNrZXQgJiYgdGhpcy5wZW5kaW5nRGVsZWdhdGlvbnNbIGlucHV0RGVmLnRpY2tldCBdICkge1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLnBlbmRpbmdEZWxlZ2F0aW9uc1sgaW5wdXREZWYudGlja2V0IF07XG5cdFx0XHRcdH1cblx0XHRcdFx0aGFuZGxlck5hbWUgPSBzdGF0ZU9ialsgaW5wdXREZWYuaW5wdXRUeXBlIF0gPyBpbnB1dERlZi5pbnB1dFR5cGUgOiBcIipcIjtcblx0XHRcdFx0aXNDYXRjaEFsbCA9ICggaGFuZGxlck5hbWUgPT09IFwiKlwiICk7XG5cdFx0XHRcdGhhbmRsZXIgPSAoIHN0YXRlT2JqWyBoYW5kbGVyTmFtZSBdIHx8IHRoaXNbIGhhbmRsZXJOYW1lIF0gKSB8fCB0aGlzWyBcIipcIiBdO1xuXHRcdFx0XHRhY3Rpb24gPSBjbGllbnRNZXRhLnN0YXRlICsgXCIuXCIgKyBoYW5kbGVyTmFtZTtcblx0XHRcdFx0Y2xpZW50TWV0YS5jdXJyZW50QWN0aW9uID0gYWN0aW9uO1xuXHRcdFx0XHR2YXIgZXZlbnRQYXlsb2FkID0gdGhpcy5idWlsZEV2ZW50UGF5bG9hZChcblx0XHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdFx0eyBpbnB1dFR5cGU6IGlucHV0RGVmLmlucHV0VHlwZSwgZGVsZWdhdGVkOiBpbnB1dERlZi5kZWxlZ2F0ZWQsIHRpY2tldDogaW5wdXREZWYudGlja2V0IH1cblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCAhaGFuZGxlciApIHtcblx0XHRcdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5OT19IQU5ETEVSLCBfLmV4dGVuZCggeyBhcmdzOiBhcmdzIH0sIGV2ZW50UGF5bG9hZCApICk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCBldmVudHMuSEFORExJTkcsIGV2ZW50UGF5bG9hZCApO1xuXHRcdFx0XHRcdGlmICggdHlwZW9mIGhhbmRsZXIgPT09IFwiZnVuY3Rpb25cIiApIHtcblx0XHRcdFx0XHRcdHJlc3VsdCA9IGhhbmRsZXIuYXBwbHkoIHRoaXMsIHRoaXMuZ2V0SGFuZGxlckFyZ3MoIGFyZ3MsIGlzQ2F0Y2hBbGwgKSApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBoYW5kbGVyO1xuXHRcdFx0XHRcdFx0dGhpcy50cmFuc2l0aW9uKCBjbGllbnQsIGhhbmRsZXIgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCBldmVudHMuSEFORExFRCwgZXZlbnRQYXlsb2FkICk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xpZW50TWV0YS5wcmlvckFjdGlvbiA9IGNsaWVudE1ldGEuY3VycmVudEFjdGlvbjtcblx0XHRcdFx0Y2xpZW50TWV0YS5jdXJyZW50QWN0aW9uID0gXCJcIjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSxcblxuXHR0cmFuc2l0aW9uOiBmdW5jdGlvbiggY2xpZW50LCBuZXdTdGF0ZSApIHtcblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0dmFyIGN1clN0YXRlID0gY2xpZW50TWV0YS5zdGF0ZTtcblx0XHR2YXIgY3VyU3RhdGVPYmogPSB0aGlzLnN0YXRlc1sgY3VyU3RhdGUgXTtcblx0XHR2YXIgbmV3U3RhdGVPYmogPSB0aGlzLnN0YXRlc1sgbmV3U3RhdGUgXTtcblx0XHR2YXIgY2hpbGQ7XG5cdFx0aWYgKCAhY2xpZW50TWV0YS5pbkV4aXRIYW5kbGVyICYmIG5ld1N0YXRlICE9PSBjdXJTdGF0ZSApIHtcblx0XHRcdGlmICggbmV3U3RhdGVPYmogKSB7XG5cdFx0XHRcdGNoaWxkID0gdGhpcy5jb25maWdGb3JTdGF0ZSggbmV3U3RhdGUgKTtcblx0XHRcdFx0aWYgKCBjdXJTdGF0ZU9iaiAmJiBjdXJTdGF0ZU9iai5fb25FeGl0ICkge1xuXHRcdFx0XHRcdGNsaWVudE1ldGEuaW5FeGl0SGFuZGxlciA9IHRydWU7XG5cdFx0XHRcdFx0Y3VyU3RhdGVPYmouX29uRXhpdC5jYWxsKCB0aGlzLCBjbGllbnQgKTtcblx0XHRcdFx0XHRjbGllbnRNZXRhLmluRXhpdEhhbmRsZXIgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnRNZXRhLnRhcmdldFJlcGxheVN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRcdGNsaWVudE1ldGEucHJpb3JTdGF0ZSA9IGN1clN0YXRlO1xuXHRcdFx0XHRjbGllbnRNZXRhLnN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRcdHZhciBldmVudFBheWxvYWQgPSB0aGlzLmJ1aWxkRXZlbnRQYXlsb2FkKCBjbGllbnQsIHtcblx0XHRcdFx0XHRmcm9tU3RhdGU6IGNsaWVudE1ldGEucHJpb3JTdGF0ZSxcblx0XHRcdFx0XHRhY3Rpb246IGNsaWVudE1ldGEuY3VycmVudEFjdGlvbixcblx0XHRcdFx0XHR0b1N0YXRlOiBuZXdTdGF0ZVxuXHRcdFx0XHR9ICk7XG5cdFx0XHRcdHRoaXMuZW1pdCggZXZlbnRzLlRSQU5TSVRJT04sIGV2ZW50UGF5bG9hZCApO1xuXHRcdFx0XHRpZiAoIG5ld1N0YXRlT2JqLl9vbkVudGVyICkge1xuXHRcdFx0XHRcdG5ld1N0YXRlT2JqLl9vbkVudGVyLmNhbGwoIHRoaXMsIGNsaWVudCApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICggY2hpbGQgKSB7XG5cdFx0XHRcdFx0Y2hpbGQuaGFuZGxlKCBjbGllbnQsIFwiX3Jlc2V0XCIgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICggY2xpZW50TWV0YS50YXJnZXRSZXBsYXlTdGF0ZSA9PT0gbmV3U3RhdGUgKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9jZXNzUXVldWUoIGNsaWVudCwgZXZlbnRzLk5FWFRfVFJBTlNJVElPTiApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZW1pdCggZXZlbnRzLklOVkFMSURfU1RBVEUsIHRoaXMuYnVpbGRFdmVudFBheWxvYWQoIGNsaWVudCwge1xuXHRcdFx0XHRzdGF0ZTogY2xpZW50TWV0YS5zdGF0ZSxcblx0XHRcdFx0YXR0ZW1wdGVkU3RhdGU6IG5ld1N0YXRlXG5cdFx0XHR9ICkgKTtcblx0XHR9XG5cdH0sXG5cblx0ZGVmZXJVbnRpbFRyYW5zaXRpb246IGZ1bmN0aW9uKCBjbGllbnQsIHN0YXRlTmFtZSApIHtcblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0aWYgKCBjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb25BcmdzICkge1xuXHRcdFx0dmFyIHF1ZXVlZCA9IHtcblx0XHRcdFx0dHlwZTogZXZlbnRzLk5FWFRfVFJBTlNJVElPTixcblx0XHRcdFx0dW50aWxTdGF0ZTogc3RhdGVOYW1lLFxuXHRcdFx0XHRhcmdzOiBjbGllbnRNZXRhLmN1cnJlbnRBY3Rpb25BcmdzXG5cdFx0XHR9O1xuXHRcdFx0Y2xpZW50TWV0YS5pbnB1dFF1ZXVlLnB1c2goIHF1ZXVlZCApO1xuXHRcdFx0dmFyIGV2ZW50UGF5bG9hZCA9IHRoaXMuYnVpbGRFdmVudFBheWxvYWQoIGNsaWVudCwge1xuXHRcdFx0XHRzdGF0ZTogY2xpZW50TWV0YS5zdGF0ZSxcblx0XHRcdFx0cXVldWVkQXJnczogcXVldWVkXG5cdFx0XHR9ICk7XG5cdFx0XHR0aGlzLmVtaXQoIGV2ZW50cy5ERUZFUlJFRCwgZXZlbnRQYXlsb2FkICk7XG5cdFx0fVxuXHR9LFxuXG5cdGRlZmVyQW5kVHJhbnNpdGlvbjogZnVuY3Rpb24oIGNsaWVudCwgc3RhdGVOYW1lICkge1xuXHRcdHRoaXMuZGVmZXJVbnRpbFRyYW5zaXRpb24oIGNsaWVudCwgc3RhdGVOYW1lICk7XG5cdFx0dGhpcy50cmFuc2l0aW9uKCBjbGllbnQsIHN0YXRlTmFtZSApO1xuXHR9LFxuXG5cdHByb2Nlc3NRdWV1ZTogZnVuY3Rpb24oIGNsaWVudCApIHtcblx0XHR2YXIgY2xpZW50TWV0YSA9IHRoaXMuZW5zdXJlQ2xpZW50TWV0YSggY2xpZW50ICk7XG5cdFx0dmFyIGZpbHRlckZuID0gZnVuY3Rpb24oIGl0ZW0gKSB7XG5cdFx0XHRyZXR1cm4gKCAoICFpdGVtLnVudGlsU3RhdGUgKSB8fCAoIGl0ZW0udW50aWxTdGF0ZSA9PT0gY2xpZW50TWV0YS5zdGF0ZSApICk7XG5cdFx0fTtcblx0XHR2YXIgdG9Qcm9jZXNzID0gXy5maWx0ZXIoIGNsaWVudE1ldGEuaW5wdXRRdWV1ZSwgZmlsdGVyRm4gKTtcblx0XHRjbGllbnRNZXRhLmlucHV0UXVldWUgPSBfLmRpZmZlcmVuY2UoIGNsaWVudE1ldGEuaW5wdXRRdWV1ZSwgdG9Qcm9jZXNzICk7XG5cdFx0Xy5lYWNoKCB0b1Byb2Nlc3MsIGZ1bmN0aW9uKCBpdGVtICkge1xuXHRcdFx0dGhpcy5oYW5kbGUuYXBwbHkoIHRoaXMsIFsgY2xpZW50IF0uY29uY2F0KCBpdGVtLmFyZ3MgKSApO1xuXHRcdH0sIHRoaXMgKTtcblx0fSxcblxuXHRjbGVhclF1ZXVlOiBmdW5jdGlvbiggY2xpZW50LCBuYW1lICkge1xuXHRcdHZhciBjbGllbnRNZXRhID0gdGhpcy5lbnN1cmVDbGllbnRNZXRhKCBjbGllbnQgKTtcblx0XHRpZiAoICFuYW1lICkge1xuXHRcdFx0Y2xpZW50TWV0YS5pbnB1dFF1ZXVlID0gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBmaWx0ZXIgPSBmdW5jdGlvbiggZXZudCApIHtcblx0XHRcdFx0cmV0dXJuICggbmFtZSA/IGV2bnQudW50aWxTdGF0ZSAhPT0gbmFtZSA6IHRydWUgKTtcblx0XHRcdH07XG5cdFx0XHRjbGllbnRNZXRhLmlucHV0UXVldWUgPSBfLmZpbHRlciggY2xpZW50TWV0YS5pbnB1dFF1ZXVlLCBmaWx0ZXIgKTtcblx0XHR9XG5cdH0sXG5cblx0Y29tcG9zaXRlU3RhdGU6IGZ1bmN0aW9uKCBjbGllbnQgKSB7XG5cdFx0dmFyIGNsaWVudE1ldGEgPSB0aGlzLmVuc3VyZUNsaWVudE1ldGEoIGNsaWVudCApO1xuXHRcdHZhciBzdGF0ZSA9IGNsaWVudE1ldGEuc3RhdGU7XG5cdFx0dmFyIGNoaWxkID0gdGhpcy5zdGF0ZXNbc3RhdGVdLl9jaGlsZCAmJiB0aGlzLnN0YXRlc1tzdGF0ZV0uX2NoaWxkLmluc3RhbmNlO1xuXHRcdGlmICggY2hpbGQgKSB7XG5cdFx0XHRzdGF0ZSArPSBcIi5cIiArIGNoaWxkLmNvbXBvc2l0ZVN0YXRlKCBjbGllbnQgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG59LCBlbWl0dGVyLmdldEluc3RhbmNlKCkgKTtcblxuQmVoYXZpb3JhbEZzbS5leHRlbmQgPSB1dGlscy5leHRlbmQ7XG5cbm1vZHVsZS5leHBvcnRzID0gQmVoYXZpb3JhbEZzbTtcblxuXG5cbi8qKioqKioqKioqKioqKioqKlxuICoqIFdFQlBBQ0sgRk9PVEVSXG4gKiogLi9zcmMvQmVoYXZpb3JhbEZzbS5qc1xuICoqIG1vZHVsZSBpZCA9IDZcbiAqKiBtb2R1bGUgY2h1bmtzID0gMFxuICoqLyJdLCJzb3VyY2VSb290IjoiIn0=