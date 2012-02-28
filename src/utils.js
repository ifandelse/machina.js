var utils = {
	getExchBase: function(fsm) {
		return fsm.messaging.exchange || "";
	},
	getTopicBase: function(fsm) {
		return fsm.messaging.topic || "";
	},
	getHandlerNames: function(fsm) {
		return _.uniq(
			_.flatten(
				_.map(fsm.states, function(st) {
					return _.keys(st);
				})
			)
		);
	},
	findProvider: function() {
		return window.postal ? "postal" : window.amplify ? "amplify" : undefined;
	},
	makeMachinaTopic: (function(){
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		}
	})(),
	getDefaultOptions: function() {
		return {
			initialState: "uninitialized",
			events: {
				"NoHandler"     : [],
				"Transitioned"  : [],
				"Handling"      : [],
				"Handled"       : [],
				"InvalidState"  : [],
				"Deferred"      : []
			},
			states: {},
			stateBag: {},
			eventQueue: [],
			messaging: {
				provider : utils.findProvider(),
				exchange: "machina",
				topic: utils.makeMachinaTopic(),
				subscriptions: [],
				publishers: []
			}
		};
	},
	standardEventTransforms: {
		"Handling" : function(payload) {
			var newPayload = payload;
			newPayload.eventType = newPayload[1];
			delete newPayload[1];
			return newPayload;
		},
		"Handled" : function(payload) {
			var newPayload = payload;
			newPayload.eventType = newPayload[1];
			delete newPayload[1];
			return newPayload;
		},
		"Transitioned" : function(payload) {
			var newPayload = payload;
			newPayload.oldState = newPayload[1];
			newPayload.newState = newPayload[2];
			delete newPayload[1];
			delete newPayload[2];
			return newPayload;
		},
		"InvalidState": function(payload) {
			var newPayload = payload;
			newPayload.currentState = newPayload[1];
			newPayload.attemptedState = newPayload[2];
			delete newPayload[1];
			delete newPayload[2];
			return newPayload;
		},
		NoHandler: function(payload) {
			var newPayload = payload;
			newPayload.eventType = newPayload[1];
			delete newPayload[1];
			return newPayload;
		}
	}
};