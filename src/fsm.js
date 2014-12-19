var Fsm = BehavioralFsm.extend( {
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
			_.defaults( this, _.cloneDeep( getDefaultClientMeta() ) );
			this.initClient();
		}
		return this;
	},
	getHandlerArgs: function( args, isCatchAll ) {
		return isCatchAll ? args.slice( 1 ) : args.slice( 2 );
	},
	// "classic" machina FSM can support event payloads of any type
	// not going to force these into a specific structure like I did
	// the BehavioralFsm event payloads
	buildEventPayload: function() {
		var client = this;
		var data = ( ( arguments[ 0 ] === this ) ? arguments[ 1 ] : arguments[ 0 ] ) || null;
		return data;
	},
	handle: function( inputType ) {
		return BehavioralFsm.prototype.handle.apply(
			this, ( arguments[ 0 ] === this ) ? arguments : [ this ].concat( getLeaklessArgs( arguments ) )
		);
	},
	transition: function( newState ) {
		return BehavioralFsm.prototype.transition.apply(
			this, ( arguments[ 0 ] === this ) ? arguments : [ this ].concat( newState )
		);
	},
	deferUntilTransition: function( stateName ) {
		return BehavioralFsm.prototype.deferUntilTransition.apply(
			this, ( arguments[ 0 ] === this ) ? arguments : [ this ].concat( stateName )
		);
	},
	processQueue: function( type ) {
		return BehavioralFsm.prototype.processQueue.apply(
			this, ( arguments[ 0 ] === this ) ? arguments : [ this ]
		);
	},
	clearQueue: function( name ) {
		return BehavioralFsm.prototype.clearQueue.apply(
			this, ( arguments[ 0 ] === this ) ? arguments : [ this ].concat( [ name ] )
		);
	}
} );
