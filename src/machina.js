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
		if(this.events[eventName]) {
			this.events[eventName].push(callback);
			return;
		}
		throw new Error("Invalid Event Name '" + eventName + "'.");
	},
	off: function(eventName, callback) {
		if(this.events[eventName]){
			_.without(this.events[eventName], callback);
		}
		throw new Error("Invalid Event Name '" + eventName + "'.");
	},
	events: {
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