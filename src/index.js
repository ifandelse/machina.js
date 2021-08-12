import { instance as emitterInstance } from "./emitter";
import { Fsm } from "./Fsm";
import { BehavioralFsm } from "./BehavioralFsm";
import { utils } from "./utils";

module.exports = {
	...emitterInstance,
	Fsm,
	BehavioralFsm,
	utils,
	eventListeners: {
		newFsm: [],
	},
};
