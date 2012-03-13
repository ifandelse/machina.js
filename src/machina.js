//import("VersionHeader.js");
//import("deepExtend.js");
//import("helpers.js");
//import("utils.js");
//import("messageBusProvider.js");
//import("postalProvider.js");
//import("amplifyProvider.js");
//import("fsm.js");

var machina = {
	Fsm: Fsm,
	busProviders: messageBusProvider,
	utils: utils,
	on: function(eventName, callback) {
		if(this.eventListeners[eventName]) {
			this.eventListeners[eventName].push(callback);
			return;
		}
		throw new Error("Invalid Event Name '" + eventName + "'.");
	},
	off: function(eventName, callback) {
		if(this.eventListeners[eventName]){
			this.eventListeners[eventName] = _.without(this.eventListeners[eventName], callback);
		}
		throw new Error("Invalid Event Name '" + eventName + "'.");
	},
	eventListeners: {
		fireEvent: function(eventName) {
			var i = 0, len, args = arguments;
			if(this[eventName]) {
				_.each(this[eventName], function(callback) {
					callback.apply(null,slice.call(args, 1));
				});
			}
		},
		newFsm : []
	}
};