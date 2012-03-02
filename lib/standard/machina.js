var machina = (function($, _, undefined) {
/*
    machina.js
    Author: Jim Cowart
    License: Dual licensed MIT (http://www.opensource.org/licenses/mit-license) & GPL (http://www.opensource.org/licenses/gpl-license)
    Version 0.1.0
*/

if(!_.deepExtend) {
	var behavior = {
		"*" : function(obj, sourcePropKey, sourcePropVal) {
			obj[sourcePropKey] = sourcePropVal;
		},
		"object": function(obj, sourcePropKey, sourcePropVal) {
			obj[sourcePropKey] = deepExtend(obj[sourcePropKey] || {}, sourcePropVal);
		},
		"array": function(obj, sourcePropKey, sourcePropVal) {
			obj[sourcePropKey] = [];
			_.each(sourcePropVal, function(item, idx) {
				behavior[getHandlerName(item)](obj[sourcePropKey], idx, item);
			}, this);
		}
	},
		getActualType = function(val) {
			if(_.isArray(val))  { return "array"; }
			if(_.isDate(val))   { return "date";  }
			if(_.isRegExp(val)) { return "regex"; }
			return typeof val;
		},
		getHandlerName = function(val) {
			var propType = getActualType(val);
			return behavior[propType] ? propType : "*";
		},
		deepExtend = function(obj) {
			_.each(slice.call(arguments, 1), function(source) {
				_.each(source, function(sourcePropVal, sourcePropKey) {
					behavior[getHandlerName(sourcePropVal)](obj, sourcePropKey, sourcePropVal);
				});
			});
			return obj;
		};

	_.mixin({
		deepExtend : deepExtend
	});
}
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
	parseEvents = function(evnts) {
		var obj = evnts;
		if(_.isArray(evnts)) {
			obj = transformEventListToObject(evnts);
		}
		return obj;
	};
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
	makeFsmNamespace: (function(){
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
				topic: utils.makeFsmNamespace(),
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
// Provide integration points with a pubsub
var messageBusProvider = { };
var PostalFsmProvider = function() {
	var eventTransformations = {},
		wireHandlersToBus = function(exch, ns, fsm) {
			fsm.messaging.subscriptions.push(
				postal.subscribe(exch, ns + ".handle.*", function(data, envelope){
					var handlerName = envelope.topic.replace(ns + ".handle.", "");
					this.handle.call(this, handlerName, data);
				}).withContext(fsm)
			);
		},
		wireEventsToBus = function(exch, ns, fsm) {
			var evnt = ns + ".event.";
			_.each(fsm.events, function(value, key) {
				var pub = function() {
					var payload = _.deepExtend({}, arguments);
					payload.stateBag = payload[0];
					delete payload[0];
					if(eventTransformations[key]) {
						payload = eventTransformations[key](payload);
					}
					postal.publish(exch, evnt + key, payload);
				};
				value.push(pub);
				fsm.messaging.publishers.push( { "Event" : key, "publish" : pub } );
			});
		};
	return {
		wireUp: function(fsm) {
			var exch = utils.getExchBase(fsm),
				ns = utils.getTopicBase(fsm),
				evnt = ns + "event.";
			if(!exch) { exch = "/"; }
			wireHandlersToBus(exch, ns, fsm);
			wireEventsToBus(exch, ns, fsm);
		},
		addEventTransforms: function(transforms) {
			_.deepExtend(eventTransformations, transforms);
		}
	};
};
messageBusProvider.postal = new PostalFsmProvider();
messageBusProvider.postal.addEventTransforms(utils.standardEventTransforms);
var AmplifyFsmProvider = function() {
	var eventTransformations = {},
		wireHandlersToBus = function(exch, ns, fsm) {
			_.each(utils.getHandlerNames(fsm), function(topic) {
				fsm.messaging.subscriptions.push(
					amplify.subscribe(exch + "." + ns + ".handle." + topic, fsm, function(data) {
						this.handle.call(this,topic, data);
					})
				);
			});
		},
		wireEventsToBus = function(exch, ns, fsm) {
			var evnt = ns + ".event.";
			_.each(fsm.events, function(value, key) {
				var pub = function() {
					var payload = _.deepExtend({}, arguments);
					payload.stateBag = payload[0];
					delete payload[0];
					if(eventTransformations[key]) {
						payload = eventTransformations[key](payload);
					}
					amplify.publish(exch + "." + evnt + key, payload);
				};
				value.push(pub);
				fsm.messaging.publishers.push( { "Event" : key, "publish" : pub } );
			});
		};
	return {
		wireUp: function(fsm) {
			var exch = utils.getExchBase(fsm),
				ns = utils.getTopicBase(fsm),
				evnt = ns + "event.";
			wireHandlersToBus(exch, ns, fsm);
			wireEventsToBus(exch, ns, fsm);
		},
		addEventTransforms: function(transforms) {
			_.deepExtend(eventTransformations, transforms);
		}
	};
};
messageBusProvider.amplify = new AmplifyFsmProvider();
messageBusProvider.amplify.addEventTransforms(utils.standardEventTransforms);
var Fsm = function(options) {
    var opt, initialState;
	if(options && options.events) {
		options.events = parseEvents(options.events);
	}
	opt = _.deepExtend({ stateBag: { _priorAction:"", _currentAction: "" }}, utils.getDefaultOptions(), options || {});
	initialState = opt.initialState;
	delete opt.initialState;
	_.extend(this,opt);

	if(this.messaging.provider && messageBusProvider[this.messaging.provider]) {
		messageBusProvider[this.messaging.provider].wireUp(this);
	}

	this.state = undefined;
	if(initialState) {
		this.transition(initialState);
	}
	machina.events.fireEvent("newFsm", this);
};

Fsm.prototype.fireEvent = function(eventName) {
    var i = 0, len, args = arguments;
    if(this.events[eventName]) {
        _.each(this.events[eventName], function(callback) {
            callback.apply(this,slice.call(args, 1));
        });
    }
};

Fsm.prototype.handle = function(msgType) {
	// vars to avoid a "this." fest
	var states = this.states, current = this.state, stateBag = this.stateBag, args = slice.call(arguments,0), handlerName;
	this.currentActionArgs = args;
    if(states[current] && (states[current][msgType] || states[current]["*"])) {
        handlerName = states[current][msgType] ? msgType : "*";
	    stateBag._currentAction = current + "." + handlerName;
        this.fireEvent.apply(this, ["Handling", stateBag ].concat(args));
	    states[current][handlerName].apply(this, [stateBag].concat(args.slice(1)));
        this.fireEvent.apply(this, ["Handled", stateBag ].concat(args));
	    stateBag._priorAction = stateBag._currentAction;
	    stateBag._currentAction = "";
	    this.processQueue(NEXT_HANDLER);
    }
    else {
        this.fireEvent.apply(this, ["NoHandler", stateBag ].concat(args));
    }
	this.currentActionArgs = undefined;
};

Fsm.prototype.transition = function(newState) {
    if(this.states[newState]){
        var oldState = this.state;
        this.state = newState;
	    if(this.states[newState]._onEnter) {
		    this.states[newState]._onEnter.call( this, this.stateBag );
	    }
        this.fireEvent.apply(this, ["Transitioned", this.stateBag, oldState, this.state ]);
	    this.processQueue(NEXT_TRANSITION);
        return;
    }
    this.fireEvent.apply(this, ["InvalidState", this.stateBag, this.state, newState ]);
};

Fsm.prototype.processQueue = function(type) {
	var filterFn = type === NEXT_TRANSITION ?
			function(item){
				return item.type === NEXT_TRANSITION && ((!item.untilState) || (item.untilState === this.state));
			} :
			function(item) {
				return item.type === NEXT_HANDLER;
			},
		toProcess = _.filter(this.eventQueue, filterFn, this);
	this.eventQueue = _.difference(this.eventQueue, toProcess);
	_.each(toProcess, function(item, index){
		this.handle.apply(this, item.args);
	}, this);
};

Fsm.prototype.deferUntilTransition = function(stateName) {
	if(this.currentActionArgs) {
		var queued = { type: NEXT_TRANSITION, untilState: stateName, args: this.currentActionArgs };
		this.eventQueue.push(queued);
		this.fireEvent.apply(this, [ "Deferred", this.stateBag, this.state, queued ]);
	}
};

Fsm.prototype.deferUntilNextHandler = function() {
	if(this.currentActionArgs) {
		var queued = { type: NEXT_TRANSITION, args: this.currentActionArgs };
		this.eventQueue.push(queued);
		this.fireEvent.apply(this, [ "Deferred", this.stateBag, this.state, queued ]);
	}
};

Fsm.prototype.on = function(eventName, callback) {
    if(this.events[eventName]) {
        this.events[eventName].push(callback);
        return;
    }
    throw new Error("Invalid Event Name '" + eventName + "'.");
};

Fsm.prototype.off = function(eventName, callback) {
    if(this.events[eventName]){
        _.without(this.events[eventName], callback);
    }
    throw new Error("Invalid Event Name '" + eventName + "'.");
};


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
return machina;})(jQuery, _);