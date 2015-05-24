/* global _, getLeaklessArgs */
/* jshint -W098 */
var emitter = {

	emit: function( eventName ) {
		var args = getLeaklessArgs( arguments );
		if ( this.eventListeners[ "*" ] ) {
			_.each( this.eventListeners[ "*" ], function( callback ) {
				if ( !this.useSafeEmit ) {
					callback.apply( this, args );
				} else {
					try {
						callback.apply( this, args );
					} catch ( exception ) {
						/* istanbul ignore else  */
						if ( console && typeof console.log !== "undefined" ) {
							console.log( exception.stack );
						}
					}
				}
			}, this );
		}
		if ( this.eventListeners[ eventName ] ) {
			_.each( this.eventListeners[ eventName ], function( callback ) {
				if ( !this.useSafeEmit ) {
					callback.apply( this, args.slice( 1 ) );
				} else {
					try {
						callback.apply( this, args.slice( 1 ) );
					} catch ( exception ) {
						/* istanbul ignore else  */
						if ( console && typeof console.log !== "undefined" ) {
							console.log( exception.stack );
						}
					}
				}
			}, this );
		}
	},

	on: function( eventName, callback ) {
		var self = this;
		self.eventListeners = self.eventListeners || { "*": [] };
		if ( !self.eventListeners[ eventName ] ) {
			self.eventListeners[ eventName ] = [];
		}
		self.eventListeners[ eventName ].push( callback );
		return {
			eventName: eventName,
			callback: callback,
			off: function() {
				self.off( eventName, callback );
			}
		};
	},

	off: function( eventName, callback ) {
		this.eventListeners = this.eventListeners || { "*": [] };
		if ( !eventName ) {
			this.eventListeners = {};
		} else {
			if ( callback ) {
				this.eventListeners[ eventName ] = _.without( this.eventListeners[ eventName ], callback );
			} else {
				this.eventListeners[ eventName ] = [];
			}
		}
	}
};
