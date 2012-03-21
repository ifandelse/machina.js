var utils = {
	makeFsmNamespace: (function(){
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		};
	})(),
	getDefaultOptions: function() {
		return {
			initialState: "uninitialized",
			eventListeners: {
				"*" : []
			},
			states: {},
			eventQueue: [],
			namespace: utils.makeFsmNamespace()
		};
	}
};