var _ = require( "lodash" );
var utils = require( "./utils" );
var emitter = require( "./emitter" );
var topLevelEmitter = emitter.instance;
var events = require( "./events" );

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
					this.emit( events.TRANSITIONED, eventPayload );
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
