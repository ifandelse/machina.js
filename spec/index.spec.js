describe( "machina - main export", () => {
	let instance,
		emitterInstance,
		Fsm,
		BehavioralFsm,
		utils;

	beforeEach( () => {
		emitterInstance = { on: "on", off: "off", };
		Fsm = "FsmConstructor";
		BehavioralFsm = "BehavioralFsmConstructor";
		utils = "utils";
		instance = global.proxyquire( "../src", {
			"./emitter": { instance: emitterInstance, },
			"./Fsm": { Fsm, },
			"./BehavioralFsm": { BehavioralFsm, },
			"./utils": { utils, },
		} );
	} );

	it( "should export the expected public interface", () => {
		instance.should.eql( {
			on: "on",
			off: "off",
			Fsm: "FsmConstructor",
			BehavioralFsm: "BehavioralFsmConstructor",
			utils: "utils",
			eventListeners: {
				newFsm: [],
			},
		} );
	} );
} );
