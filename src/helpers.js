var slice = [].slice,
	NEXT_TRANSITION = "transition",
	NEXT_HANDLER = "handler",
	transformEventListToObject = function(eventList){
		var obj = {};
		_.each(eventList, function(evntName) {
			obj[evntName] = [];
		});
		return obj;
	},
	parseEventListeners = function(evnts) {
		var obj = evnts;
		if(_.isArray(evnts)) {
			obj = transformEventListToObject(evnts);
		}
		return obj;
	};