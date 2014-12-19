var MACHINA_PROP = "__machina__";

function BehavioralFsm( options ) {
	_.extend( this, options );
	_.defaults( this, getDefaultBehavioralOptions() );
	this.initialize.apply( this, arguments );
	machina.emit( NEW_FSM, this );
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

	ensureClientMeta: function ensureClientMeta( client ) {
		if ( typeof client !== "object" ) {
			throw new Error( "A BehavioralFsm client must be an object, not a primitive." );
		}
		if ( !client[ MACHINA_PROP ] ) {
			client[ MACHINA_PROP ] = _.cloneDeep( getDefaultClientMeta() );
			this.initClient( client );
		}
		return client[ MACHINA_PROP ];
	},

	buildEventPayload: function( client, data ) {
		if ( _.isPlainObject( data ) ) {
			return _.extend( data, { client: client } );
		} else {
			return { client: client, data: data || null };
		}
	},

	getHandlerArgs: function( args, isCatchAll ) {
		return isCatchAll ? args : [ args[ 0 ] ].concat( args.slice( 2 ) );
	},

	handle: function( client, inputType ) {
		var clientMeta = this.ensureClientMeta( client );
		var args = getLeaklessArgs( arguments );
		var currentState = clientMeta.state;
		clientMeta.currentActionArgs = args.slice( 1 );
		var handlerName;
		var handler;
		var isCatchAll = false;
		var result;
		if ( !clientMeta.inExitHandler ) {
			handlerName = this.states[ currentState ][ inputType ] ? inputType : "*";
			isCatchAll = ( handlerName === "*" );
			handler = ( this.states[ currentState ][ handlerName ] || this[ handlerName ] ) || this[ "*" ];
			action = clientMeta.state + "." + handlerName;
			clientMeta.currentAction = action;
			var eventPayload = this.buildEventPayload( client, { inputType: inputType } );
			if ( !handler ) {
				this.emit( NO_HANDLER, eventPayload );
			} else {
				this.emit( HANDLING, eventPayload );
				if ( typeof handler === "function" ) {
					result = handler.apply( this, this.getHandlerArgs( args, isCatchAll ) );
				} else {
					result = handler;
					this.transition( client, handler );
				}
				this.emit( HANDLED, eventPayload );
			}
			clientMeta.priorAction = clientMeta.currentAction;
			clientMeta.currentAction = "";
		}
		return result;
	},

	transition: function( client, newState ) {
		var clientMeta = this.ensureClientMeta( client );
		var curState = clientMeta.state;
		if ( !clientMeta.inExitHandler && newState !== curState ) {
			if ( this.states[ newState ] ) {
				if ( curState && this.states[ curState ] && this.states[ curState ]._onExit ) {
					clientMeta.inExitHandler = true;
					this.states[ curState ]._onExit.call( this, client );
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
				this.emit( TRANSITION, eventPayload );
				if ( this.states[ newState ]._onEnter ) {
					this.states[ newState ]._onEnter.call( this, client );
				}
				if ( clientMeta.targetReplayState === newState ) {
					this.processQueue( client, NEXT_TRANSITION );
				}
				return;
			}
			this.emit.call( this, INVALID_STATE, {
				state: clientMeta.state,
				attemptedState: newState
			} );
		}
	},

	deferUntilTransition: function( client, stateName ) {
		var clientMeta = this.ensureClientMeta( client );
		if ( clientMeta.currentActionArgs ) {
			var queued = {
				type: NEXT_TRANSITION,
				untilState: stateName,
				args: clientMeta.currentActionArgs
			};
			clientMeta.inputQueue.push( queued );
			var eventPayload = this.buildEventPayload( client, {
				state: clientMeta.state,
				queuedArgs: queued
			} );
			this.emit( DEFERRED, eventPayload );
		}
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
	}
}, emitter );

BehavioralFsm.extend = extend;
