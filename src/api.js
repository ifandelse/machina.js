/* global _, emitter, Fsm, BehavioralFsm, utils */
/* jshint -W098 */
var machina = _.merge( emitter, {
	Fsm: Fsm,
	BehavioralFsm: BehavioralFsm,
	utils: utils,
	eventListeners: {
		newFsm: []
	}
} );
