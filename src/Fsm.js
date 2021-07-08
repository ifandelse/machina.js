const BehavioralFsm = require( "./BehavioralFsm" );
const utils = require( "./utils" );
const _ = require( "lodash" );

let Fsm = {
	constructor() {
		BehavioralFsm.apply( this, arguments ); // eslint-disable-line prefer-rest-params
		this.ensureClientMeta();
	},
	initClient: function initClient() {
		const initialState = this.initialState;
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

	ensureClientArg( args ) {
		const _args = args;
		// we need to test the args and verify that if a client arg has
		// been passed, it must be this FSM instance (this isn't a behavioral FSM)
		if ( typeof _args[ 0 ] === "object" && !( "inputType" in _args[ 0 ] ) && _args[ 0 ] !== this ) {
			_args.splice( 0, 1, this );
		} else if ( typeof _args[ 0 ] !== "object" || ( typeof _args[ 0 ] === "object" && ( "inputType" in _args[ 0 ] ) ) ) {
			_args.unshift( this );
		}
		return _args;
	},

	getHandlerArgs( args, isCatchAll ) {
		// index 0 is the client, index 1 is inputType
		// if we're in a catch-all handler, input type needs to be included in the args
		// inputType might be an object, so we need to just get the inputType string if so
		const _args = args;
		const input = _args[ 1 ];
		if ( typeof inputType === "object" ) {
			_args.splice( 1, 1, input.inputType );
		}
		return isCatchAll ?
			_args.slice( 1 ) :
			_args.slice( 2 );
	},

	getSystemHandlerArgs( args /* client */ ) {
		return args;
	},

	// "classic" machina FSM do not emit the client property on events (which would be the FSM itself)
	buildEventPayload() {
		const args = this.ensureClientArg( utils.getLeaklessArgs( arguments ) ); // eslint-disable-line prefer-rest-params
		const data = args[ 1 ];
		if ( _.isPlainObject( data ) ) {
			return _.extend( data, { namespace: this.namespace, } );
		}
		return { data: data || null, namespace: this.namespace, };
	},
};

_.each( [
	"handle",
	"transition",
	"deferUntilTransition",
	"processQueue",
	"clearQueue",
], function( methodWithClientInjected ) {
	Fsm[ methodWithClientInjected ] = function() {
		const args = this.ensureClientArg( utils.getLeaklessArgs( arguments ) ); // eslint-disable-line prefer-rest-params
		return BehavioralFsm.prototype[ methodWithClientInjected ].apply( this, args );
	};
} );

Fsm = BehavioralFsm.extend( Fsm );

module.exports = Fsm;
