define(['jquery', 'underscore'], function($, _) {
/*
    machina.js
    Author: Jim Cowart
    License: Dual licensed MIT (http://www.opensource.org/licenses/mit-license) & GPL (http://www.opensource.org/licenses/gpl-license)
    Version 0.1.0
*/

if (!_.deepExtend) {
	var behavior = {
		"*": function(obj, sourcePropKey, sourcePropVal) {
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
			if (_.isArray(val)) {
				return "array";
			}
			if (_.isDate(val)) {
				return "date";
			}
			if (_.isRegExp(val)) {
				return "regex";
			}
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
		deepExtend: deepExtend
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
	parseEventListeners = function(evnts) {
		var obj = evnts;
		if(_.isArray(evnts)) {
			obj = transformEventListToObject(evnts);
		}
		return obj;
	};
var utils = {
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
			eventListeners: {
				"*" : []
			},
			states: {},
			eventQueue: [],
			messaging: (function() {
				var fsmNamespace = utils.makeFsmNamespace();
				return {
					provider : utils.findProvider(),
					eventNamespace: fsmNamespace + ".events",
					handlerNamespace: fsmNamespace,
					subscriptions: []
				}
			})()
		};
	},
	standardEventTransforms: {
		Handling : function(payload) {
			var newPayload = payload;
			newPayload.eventType = newPayload[1];
			delete newPayload[1];
			return newPayload;
		},
		Handled : function(payload) {
			var newPayload = payload;
			newPayload.eventType = newPayload[1];
			delete newPayload[1];
			return newPayload;
		},
		Transitioned : function(payload) {
			var newPayload = payload;
			newPayload.oldState = newPayload[1];
			newPayload.newState = newPayload[2];
			delete newPayload[1];
			delete newPayload[2];
			return newPayload;
		},
		InvalidState: function(payload) {
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
		wireHandlersToBus = function(fsm) {
			fsm.messaging.subscriptions.push(
				postal.subscribe(fsm.messaging.handlerNamespace, "*", function(data, envelope){
					this.handle.call(this, envelope.topic, data);
				}).withContext(fsm)
			);
		},
		wireEventsToBus = function(fsm) {
			fsm.messaging.eventPublisher = function(){
				var topic = arguments[0],
					payload = _.deepExtend({}, slice.call(arguments, 1));
				if(eventTransformations[topic]) {
					payload = eventTransformations[topic](payload);
				}
				postal.publish(fsm.messaging.eventNamespace, topic, payload);
			};
			fsm.on("*", fsm.messaging.eventPublisher);
		};
	return {
		wireUp: function(fsm) {
			wireHandlersToBus(fsm);
			wireEventsToBus(fsm);
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
		wireHandlersToBus = function(fsm) {
			_.each(utils.getHandlerNames(fsm), function(topic) {
				fsm.messaging.subscriptions.push(
					amplify.subscribe(fsm.messaging.handlerNamespace + "." + topic, fsm, function(data) {
						this.handle.call(this,topic, data);
					})
				);
			});
		},
		wireEventsToBus = function(fsm) {
			fsm.messaging.eventPublisher = function(){
				var topic = arguments[0],
					payload = _.deepExtend({}, slice.call(arguments, 1));
				if(eventTransformations[topic]) {
					payload = eventTransformations[topic](payload);
				}
				amplify.publish(fsm.messaging.eventNamespace + "." + topic, payload);
			};
			fsm.on("*", fsm.messaging.eventPublisher);
		};
	return {
		wireUp: function(fsm) {
			wireHandlersToBus(fsm);
			wireEventsToBus(fsm);
		},
		addEventTransforms: function(transforms) {
			_.deepExtend(eventTransformations, transforms);
		}
	};
};
messageBusProvider.amplify = new AmplifyFsmProvider();
messageBusProvider.amplify.addEventTransforms(utils.standardEventTransforms);
var Fsm = function(options) {
    var opt, initialState, defaults = utils.getDefaultOptions();
	if(options) {
		if(options.eventListeners) {
			options.eventListeners = parseEventListeners(options.eventListeners);
		}
		if(options.messaging) {
			options.messaging = _.extend({}, defaults.messaging, options.messaging);
		}
	}
	opt = _.extend(defaults , options || {});
	initialState = opt.initialState;
	delete opt.initialState;
	_.extend(this,opt);

	if(this.messaging.provider && messageBusProvider[this.messaging.provider]) {
		messageBusProvider[this.messaging.provider].wireUp(this);
	}

	this.state = undefined;
	this._priorAction = "";
	this._currentAction = "";
	if(initialState) {
		this.transition(initialState);
	}
	machina.eventListeners.fireEvent("newFsm", this);
};

Fsm.prototype.fireEvent = function(eventName) {
    var i = 0, len, args = arguments;
	_.each(this.eventListeners["*"], function(callback) {
		callback.apply(this,slice.call(args, 0));
	});
    if(this.eventListeners[eventName]) {
        _.each(this.eventListeners[eventName], function(callback) {
	        callback.apply(this,slice.call(args, 1));
        });
    }
};

Fsm.prototype.handle = function(msgType) {
	// vars to avoid a "this." fest
	var states = this.states, current = this.state, args = slice.call(arguments,0), handlerName;
	this.currentActionArgs = args;
    if(states[current] && (states[current][msgType] || states[current]["*"])) {
        handlerName = states[current][msgType] ? msgType : "*";
	    this._currentAction = current + "." + handlerName;
        this.fireEvent.apply(this, ["Handling"].concat(args));
	    states[current][handlerName].apply(this, args.slice(1));
        this.fireEvent.apply(this, ["Handled"].concat(args));
	    this._priorAction = this._currentAction;
	    this._currentAction = "";
	    this.processQueue(NEXT_HANDLER);
    }
    else {
        this.fireEvent.apply(this, ["NoHandler"].concat(args));
    }
	this.currentActionArgs = undefined;
};

Fsm.prototype.transition = function(newState) {
    if(this.states[newState]){
        var oldState = this.state;
        this.state = newState;
	    if(this.states[newState]._onEnter) {
		    this.states[newState]._onEnter.call( this );
	    }
        this.fireEvent.apply(this, ["Transitioned", oldState, this.state ]);
	    this.processQueue(NEXT_TRANSITION);
        return;
    }
    this.fireEvent.apply(this, ["InvalidState", this.state, newState ]);
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
		this.fireEvent.apply(this, [ "Deferred", this.state, queued ]);
	}
};

Fsm.prototype.deferUntilNextHandler = function() {
	if(this.currentActionArgs) {
		var queued = { type: NEXT_TRANSITION, args: this.currentActionArgs };
		this.eventQueue.push(queued);
		this.fireEvent.apply(this, [ "Deferred", this.state, queued ]);
	}
};

Fsm.prototype.on = function(eventName, callback) {
    if(!this.eventListeners[eventName]) {
	    this.eventListeners[eventName] = [];
    }
	this.eventListeners[eventName].push(callback);
};

Fsm.prototype.off = function(eventName, callback) {
    if(this.eventListeners[eventName]){
        _.without(this.eventListeners[eventName], callback);
    }
};


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
			_.without(this.eventListeners[eventName], callback);
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
return machina;});