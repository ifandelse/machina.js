var slice = [].slice;
var NEXT_TRANSITION = "transition";
var NEXT_HANDLER    = "handler";
var HANDLING        = "handling";
var HANDLED         = "handled";
var NO_HANDLER      = "nohandler";
var TRANSITION      = "transition";
var INVALID_STATE   = "invalidstate";
var DEFERRED        = "deferred";
var NEW_FSM         = "newfsm";
var utils = {
	makeFsmNamespace: (function(){
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		};
	})(),
	getDefaultOptions: function() {
		return {
			initialState      : "uninitialized",
			eventListeners    : {
				"*" : []
			},
      states            : {},
			eventQueue        : [],
			namespace         : utils.makeFsmNamespace(),
			targetReplayState : "",
			state             : undefined,
			priorState        : undefined,
			_priorAction      : "",
			_currentAction    : ""
		};
	}
};