//import("VersionHeader.js");
(function(root, doc, factory) {
	if (typeof define === "function" && define.amd) {
		// AMD. Register as an anonymous module.
		define(["underscore"], function(_) {
			return factory(_, root, doc);
		});
	} else {
		// Browser globals
		factory(root._, root, doc);
	}
}(this, document, function(_, global, document, undefined) {

	//import("helpers.js");
	//import("utils.js");
	//import("fsm.js");

	var machina = {
		Fsm: Fsm,
		bus: undefined,
		utils: utils,
		on: function(eventName, callback) {
			if(!this.eventListeners[eventName]) {
				this.eventListeners[eventName] = [];
			}
			this.eventListeners[eventName].push(callback);
		},
		off: function(eventName, callback) {
			if(this.eventListeners[eventName]){
				this.eventListeners[eventName] = _.without(this.eventListeners[eventName], callback);
			}
		},
		fireEvent: function(eventName) {
			var i = 0, len, args = arguments, listeners = this.eventListeners[eventName];
			if(listeners && listeners.length) {
				_.each(listeners, function(callback) {
					callback.apply(null,slice.call(args, 1));
				});
			}
		},
		eventListeners: {
			newFsm : []
		}
	};

	global.machina = machina;
	return machina;
}));