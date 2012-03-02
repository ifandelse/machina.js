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
