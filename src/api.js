var machina = _.merge( emitter, {
	Fsm: Fsm,
	BehavioralFsm: BehavioralFsm,
	utils: utils,
	eventListeners: {
		newFsm: []
	}
} );
