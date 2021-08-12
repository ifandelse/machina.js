import _ from "lodash";

export function getInstance() {
	return {
		emit( ...args ) {
			const [ eventName, ] = args;
			if ( this.eventListeners[ "*" ] ) {
				_.each( this.eventListeners[ "*" ], function( callback ) {
					if ( !this.useSafeEmit ) {
						callback.apply( this, args );
					} else {
						try {
							callback.apply( this, args );
						} catch ( exception ) {
							/* istanbul ignore else  */
							if ( console && typeof console.log !== "undefined" ) { // eslint-disable-line no-console
								console.log( exception.stack ); // eslint-disable-line no-console
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
							if ( console && typeof console.log !== "undefined" ) { // eslint-disable-line no-console
								console.log( exception.stack ); // eslint-disable-line no-console
							}
						}
					}
				}.bind( this ) );
			}
		},

		on( eventName, callback ) {
			const self = this;
			self.eventListeners = self.eventListeners || { "*": [], };
			if ( !self.eventListeners[ eventName ] ) {
				self.eventListeners[ eventName ] = [];
			}
			self.eventListeners[ eventName ].push( callback );
			return {
				eventName,
				callback,
				off() {
					self.off( eventName, callback );
				},
			};
		},

		off( eventName, callback ) {
			this.eventListeners = this.eventListeners || { "*": [], };
			if ( !eventName ) {
				this.eventListeners = {};
			} else if ( callback ) {
				this.eventListeners[ eventName ] = _.without( this.eventListeners[ eventName ], callback );
			} else {
				this.eventListeners[ eventName ] = [];
			}
		},
	};
}

const _instance = getInstance();

export { _instance as instance };
