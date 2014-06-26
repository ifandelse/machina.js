var machina = {
	Fsm: Fsm,
	utils: utils,
	on: function( eventName, callback ) {
		if ( !this.eventListeners[ eventName ] ) {
			this.eventListeners[ eventName ] = [];
		}
		this.eventListeners[ eventName ].push( callback );
		return callback;
	},
	off: function( eventName, callback ) {
		if ( this.eventListeners[ eventName ] ) {
			this.eventListeners[ eventName ] = _.without( this.eventListeners[ eventName ], callback );
		}
	},
	trigger: function( eventName ) {
		var i = 0,
			len, args = arguments,
			listeners = this.eventListeners[ eventName ] || [];
		if ( listeners && listeners.length ) {
			_.each( listeners, function( callback ) {
				callback.apply( null, slice.call( args, 1 ) );
			} );
		}
	},
	eventListeners: {
		newFsm: []
	}
};

machina.emit = machina.trigger;