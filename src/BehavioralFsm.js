const _ = require( "lodash" );
const utils = require( "./utils" );
const emitter = require( "./emitter" );
const topLevelEmitter = emitter.instance;
const events = require( "./events" );

const MACHINA_PROP = "__machina__";

function BehavioralFsm( options ) {
	_.extend( this, options );
	_.defaults( this, utils.getDefaultBehavioralOptions() );
	this.initialize.apply( this, arguments ); // eslint-disable-line prefer-spread, prefer-rest-params
	topLevelEmitter.emit( events.NEW_FSM, this );
}

_.extend( BehavioralFsm.prototype, {
	initialize() {},

	initClient: function initClient( client ) {
		const initialState = this.initialState;
		if ( !initialState ) {
			throw new Error( "You must specify an initial state for this FSM" );
		}
		if ( !this.states[ initialState ] ) {
			throw new Error( "The initial state specified does not exist in the states object." );
		}
		this.transition( client, initialState );
	},

	configForState: function configForState( newState ) {
		const newStateObj = this.states[ newState ];
		let child;
		_.each( this.hierarchy, function( childListener /* key */ ) {
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

	buildEventPayload( client, data ) {
		if ( _.isPlainObject( data ) ) {
			return _.extend( data, { client, namespace: this.namespace, } );
		}
		return { client, data: data || null, namespace: this.namespace, };
	},

	getHandlerArgs( args, isCatchAll ) {
		// index 0 is the client, index 1 is inputType
		// if we're in a catch-all handler, input type needs to be included in the args
		// inputType might be an object, so we need to just get the inputType string if so
		const _args = args.slice( 0 );
		const input = _args[ 1 ];
		if ( typeof input === "object" ) {
			_args.splice( 1, 1, input.inputType );
		}
		return isCatchAll ?
			_args :
			[ _args[ 0 ], ].concat( _args.slice( 2 ) );
	},

	getSystemHandlerArgs( args, client ) {
		return [ client, ].concat( args );
	},

	// eslint-disable-next-line max-statements
	handle( client, input ) {
		let inputDef = input;
		if ( typeof input === "undefined" ) {
			throw new Error( "The input argument passed to the FSM's handle method is undefined. Did you forget to pass the input name?" );
		}
		if ( typeof input === "string" ) {
			inputDef = { inputType: input, delegated: false, ticket: undefined, };
		}
		const clientMeta = this.ensureClientMeta( client );
		const args = utils.getLeaklessArgs( arguments ); // eslint-disable-line prefer-rest-params
		if ( typeof input !== "object" ) {
			args.splice( 1, 1, inputDef );
		}
		clientMeta.currentActionArgs = args.slice( 1 );
		const currentState = clientMeta.state;
		const stateObj = this.states[ currentState ];
		let handlerName,
			handler,
			child,
			result,
			action;
		let isCatchAll = false;
		if ( !clientMeta.inExitHandler ) {
			child = this.configForState( currentState );
			if ( child && !this.pendingDelegations[ inputDef.ticket ] && !inputDef.bubbling ) {
				inputDef.ticket = ( inputDef.ticket || utils.createUUID() );
				inputDef.delegated = true;
				this.pendingDelegations[ inputDef.ticket ] = { delegatedTo: child.namespace, };
				// WARNING - returning a value from `handle` on child FSMs is not really supported.
				// If you need to return values from child FSM input handlers, use events instead.
				result = child.handle.apply( child, args ); // eslint-disable-line prefer-spread
			} else {
				if ( inputDef.ticket && this.pendingDelegations[ inputDef.ticket ] ) {
					delete this.pendingDelegations[ inputDef.ticket ];
				}
				handlerName = stateObj[ inputDef.inputType ] ? inputDef.inputType : "*";
				isCatchAll = ( handlerName === "*" );
				handler = ( stateObj[ handlerName ] || this[ handlerName ] ) || this[ "*" ];
				action = `${ clientMeta.state }.${ handlerName }`;
				clientMeta.currentAction = action;
				const eventPayload = this.buildEventPayload(
					client,
					{ inputType: inputDef.inputType, delegated: inputDef.delegated, ticket: inputDef.ticket, }
				);
				if ( !handler ) {
					this.emit( events.NO_HANDLER, _.extend( { args, }, eventPayload ) );
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

	// eslint-disable-next-line max-statements
	transition( client, newState ) {
		const clientMeta = this.ensureClientMeta( client );
		const curState = clientMeta.state;
		const curStateObj = this.states[ curState ];
		const newStateObj = this.states[ newState ];
		let child;
		const args = utils.getLeaklessArgs( arguments ).slice( 2 ); // eslint-disable-line prefer-rest-params
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
				const eventPayload = this.buildEventPayload( client, {
					fromState: clientMeta.priorState,
					action: clientMeta.currentAction,
					toState: newState,
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
				attemptedState: newState,
			} ) );
		}
	},

	deferUntilTransition( client, stateName ) {
		const clientMeta = this.ensureClientMeta( client );
		const stateList = _.isArray( stateName ) ? stateName : ( stateName ? [ stateName, ] : undefined ); // eslint-disable-line no-nested-ternary
		if ( clientMeta.currentActionArgs ) {
			const queued = {
				type: events.NEXT_TRANSITION,
				untilState: stateList,
				args: clientMeta.currentActionArgs,
			};
			clientMeta.inputQueue.push( queued );
			const eventPayload = this.buildEventPayload( client, {
				state: clientMeta.state,
				queuedArgs: queued,
			} );
			this.emit( events.DEFERRED, eventPayload );
		}
	},

	deferAndTransition( client, stateName ) {
		this.deferUntilTransition( client, stateName );
		this.transition( client, stateName );
	},

	processQueue( client ) {
		const clientMeta = this.ensureClientMeta( client );
		const filterFn = function( item ) {
			return ( ( !item.untilState ) || ( _.includes( item.untilState, clientMeta.state ) ) );
		};
		const toProcess = _.filter( clientMeta.inputQueue, filterFn );
		clientMeta.inputQueue = _.difference( clientMeta.inputQueue, toProcess );
		_.each( toProcess, function( item ) {
			this.handle.apply( this, [ client, ].concat( item.args ) ); // eslint-disable-line prefer-spread
		}.bind( this ) );
	},

	clearQueue( client, name ) {
		const clientMeta = this.ensureClientMeta( client );
		if ( !name ) {
			clientMeta.inputQueue = [];
		} else {
			// first pass we remove the target state from any `untilState` array
			_.each( clientMeta.inputQueue, function( item ) {
				item.untilState = _.without( item.untilState, name );
			} );
			// second pass we clear out deferred events with empty untilState arrays
			const filter = function( evnt ) {
				return evnt.untilState.length !== 0;
			};
			clientMeta.inputQueue = _.filter( clientMeta.inputQueue, filter );
		}
	},

	compositeState( client ) {
		const clientMeta = this.ensureClientMeta( client );
		let state = clientMeta.state;
		const child = this.states[ state ]._child && this.states[ state ]._child.instance;
		if ( child ) {
			state += `.${ child.compositeState( client ) }`;
		}
		return state;
	},
}, emitter.getInstance() );

BehavioralFsm.extend = utils.extend;

module.exports = BehavioralFsm;
