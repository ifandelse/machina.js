var Fsm = function ( options ) {
	_.extend( this, options );
	_.defaults(this, utils.getDefaultOptions());
	this.initialize.apply(this, arguments);
	machina.emit( NEW_FSM, this );
	if ( this.initialState ) {
		this.transition( this.initialState );
	}
};

_.extend( Fsm.prototype, {
	initialize: function() { },
	emit : function ( eventName ) {
		var args = arguments;
		if(this.eventListeners["*"]) {
			_.each( this.eventListeners["*"], function ( callback ) {
				try {
					callback.apply( this, slice.call( args, 0 ) );
				} catch ( exception ) {
					if ( console && typeof console.log !== "undefined" ) {
						console.log( exception.toString() );
					}
				}
			}, this );
		}
		if ( this.eventListeners[eventName] ) {
			_.each( this.eventListeners[eventName], function ( callback ) {
				try {
					callback.apply( this, slice.call( args, 1 ) );
				} catch ( exception ) {
					if ( console && typeof console.log !== "undefined" ) {
						console.log( exception.toString() );
					}
				}
			}, this );
		}
	},
	handle : function ( inputType ) {
		if ( !this.inExitHandler ) {
			var states = this.states, current = this.state, args = slice.call( arguments, 0 ), handlerName, handler, catchAll, action;
			this.currentActionArgs = args;
			if ( states[current][inputType] || states[current]["*"] || this[ "*" ] ) {
				handlerName = states[current][inputType] ? inputType : "*";
				catchAll = handlerName === "*";
				if ( states[current][handlerName] ) {
					handler = states[current][handlerName];
					action = current + "." + handlerName;
				} else {
					handler = this[ "*" ];
					action = "*";
				}
				if ( ! this._currentAction ) 
					this._currentAction = action ;
				this.emit.call( this, HANDLING, { inputType: inputType, args: args.slice(1) } );
				if (_.isFunction(handler))
					handler = handler.apply( this, catchAll ? args : args.slice( 1 ) );
				if (_.isString(handler))
					this.transition( handler ) ;
				this.emit.call( this, HANDLED, { inputType: inputType, args: args.slice(1) } );
				this._priorAction = this._currentAction;
				this._currentAction = "";
				this.processQueue( NEXT_HANDLER );
			}
			else {
				this.emit.call( this, NO_HANDLER, { inputType: inputType, args: args.slice(1) } );
			}
			this.currentActionArgs = undefined;
		}
	},
	transition : function ( newState ) {
		if ( !this.inExitHandler && newState !== this.state ) {
			var oldState;
			if ( this.states[newState] ) {
				this.targetReplayState = newState;
				this.priorState = this.state;
				this.state = newState;
				oldState = this.priorState;
				if ( this.states[oldState] && this.states[oldState]._onExit ) {
					this.inExitHandler = true;
					this.states[oldState]._onExit.call( this );
					this.inExitHandler = false;
				}
				this.emit.call( this, TRANSITION, { fromState: oldState, action: this._currentAction, toState: newState } );
				if ( this.states[newState]._onEnter ) {
					this.states[newState]._onEnter.call( this );
				}
				if ( this.targetReplayState === newState ) {
					this.processQueue( NEXT_TRANSITION );
				}
				return;
			}
			this.emit.call( this, INVALID_STATE, { state: this.state, attemptedState: newState } );
		}
	},
	processQueue : function ( type ) {
		var filterFn = type === NEXT_TRANSITION ? function ( item ) {
				return item.type === NEXT_TRANSITION && ((!item.untilState) || (item.untilState === this.state));
			} : function ( item ) {
				return item.type === NEXT_HANDLER;
			};
		var toProcess = _.filter( this.eventQueue, filterFn, this );
		this.eventQueue = _.difference( this.eventQueue, toProcess );
		_.each( toProcess, function ( item ) {
			this.handle.apply( this, item.args );
		}, this );
	},
	clearQueue : function ( type, name ) {
		if(!type) {
			this.eventQueue = [];
		} else {var filter;
			if ( type === NEXT_TRANSITION ) {
				filter = function ( evnt ) {
					return (evnt.type === NEXT_TRANSITION && (name ? evnt.untilState === name : true ));
				};
			} else if ( type === NEXT_HANDLER ) {
				filter = function ( evnt ) {
					return evnt.type === NEXT_HANDLER;
				};
			}
			this.eventQueue = _.filter( this.eventQueue, filter );
		}
	},
	deferUntilTransition : function ( stateName ) {
		if ( this.currentActionArgs ) {
			var queued = { type : NEXT_TRANSITION, untilState : stateName, args : this.currentActionArgs };
			this.eventQueue.push( queued );
			this.emit.call( this, DEFERRED, { state: this.state, queuedArgs: queued } );
		}
	},
	deferUntilNextHandler : function () {
		if ( this.currentActionArgs ) {
			var queued = { type : NEXT_TRANSITION, args : this.currentActionArgs };
			this.eventQueue.push( queued );
			this.emit.call( this, DEFERRED, { state: this.state, queuedArgs: queued } );
		}
	},
	on : function ( eventName, callback ) {
		var self = this;
		if ( !self.eventListeners[eventName] ) {
			self.eventListeners[eventName] = [];
		}
		self.eventListeners[eventName].push( callback );
		return {
			eventName: eventName,
			callback: callback,
			off: function() {
				self.off(eventName, callback);
			}
		};
	},
	off : function ( eventName, callback ) {
		if(!eventName) {
			this.eventListeners = {};
		} else {
			if ( this.eventListeners[eventName] ) {
				if(callback) {
					this.eventListeners[eventName] = _.without( this.eventListeners[eventName], callback );
				} else {
					this.eventListeners[eventName] = [];
				}
			}
		}
	}
} );

Fsm.prototype.trigger = Fsm.prototype.emit;

var ctor = function () {};

var inherits = function ( parent, protoProps, staticProps ) {
	var fsm;

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if ( protoProps && protoProps.hasOwnProperty( 'constructor' ) ) {
		fsm = protoProps.constructor;
	} else {
		fsm = function () {
			parent.apply( this, arguments );
		};
	}

	// Inherit class (static) properties from parent.
	_.deepExtend( fsm, parent );

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	ctor.prototype = parent.prototype;
	fsm.prototype = new ctor();

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if ( protoProps ) {
		_.deepExtend( fsm.prototype, protoProps );
	}

	// Add static properties to the constructor function, if supplied.
	if ( staticProps ) {
		_.deepExtend( fsm, staticProps );
	}

	// Correctly set child's `prototype.constructor`.
	fsm.prototype.constructor = fsm;

	// Set a convenience property in case the parent's prototype is needed later.
	fsm.__super__ = parent.prototype;

	return fsm;
};

// The self-propagating extend function that Backbone classes use.
Fsm.extend = function ( protoProps, classProps ) {
	var fsm = inherits( this, protoProps, classProps );
	fsm.extend = this.extend;
	return fsm;
};