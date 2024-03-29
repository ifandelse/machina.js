var utils = require( "./utils" );
var _ = require( "lodash" );

function getInstance() {
	return {
		emit( eventName ) {
			var args = utils.getLeaklessArgs( arguments );
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
				}.bind( this ) );
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
				}.bind( this ) );
			}
		},

		on( eventName, callback ) {
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

		off( eventName, callback ) {
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
}

module.exports = {
	getInstance: getInstance,
	instance: getInstance()
};
