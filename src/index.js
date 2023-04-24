var _ = require( "lodash" );
var emitter = require( "./emitter" );

module.exports = _.merge( emitter.instance, {
	Fsm: require( "./Fsm" ),
	BehavioralFsm: require( "./BehavioralFsm" ),
	utils: require( "./utils" ),
	eventListeners: {
		newFsm: []
	}
} );
