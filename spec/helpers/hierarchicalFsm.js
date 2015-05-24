/* global _ */
module.exports = function( machina ) {
	var DO_NOT_WALK = "Do Not Walk";
	var WALK = "Walk";
	var RED = "red";
	var YELLOW = "yellow";
	var GREEN = "green";

	return {
		crosswalkFactory: function( options ) {
			// Child FSM
			var vehicleSignal = new machina.Fsm( {
				namespace: "vehicle-signal",
				initialState: "uninitialized",
				reset: function() {
					this.transition( "green" );
				},
				states: {
					uninitialized: {
						"*": function() {
							this.deferUntilTransition();
							this.transition( "green" );
						}
					},
					green: {
						_onEnter: function() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 30000 );
							this.emit( "vehicles", { status: GREEN } );
						},
						timeout: "green-interruptible",
						pedestrianWaiting: function() {
							this.deferUntilTransition( "green-interruptible" );
						},
						_onExit: function() {
							clearTimeout( this.timer );
						}
					},
					"green-interruptible": {
						pedestrianWaiting: "yellow"
					},
					yellow: {
						_onEnter: function() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 5000 );
							this.emit( "vehicles", { status: YELLOW } );
						},
						_reset: "green",
						_onExit: function() {
							clearTimeout( this.timer );
						}
					}
				}
			} );

			// Child FSM
			var pedestrianSignal = new machina.Fsm( {
				namespace: "pedestrian-signal",
				initialState: "uninitialized",
				reset: function() {
					this.transition( "walking" );
				},
				states: {
					uninitialized: {
						"*": function() {
							this.deferUntilTransition();
							this.transition( "walking" );
						}
					},
					walking: {
						_onEnter: function() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 30000 );
							this.emit( "pedestrians", { status: WALK } );
						},
						timeout: "flashing",
						_onExit: function() {
							clearTimeout( this.timer );
						}
					},
					flashing: {
						_onEnter: function() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 5000 );
							this.emit( "pedestrians", { status: DO_NOT_WALK, flashing: true } );
						},
						_reset: "walking",
						_onExit: function() {
							clearTimeout( this.timer );
						}
					}
				}
			} );

			// Parent FSM
			var crosswalk = new machina.Fsm( _.merge( {
				namespace: "crosswalk",
				initialState: "vehiclesEnabled",
				states: {
					vehiclesEnabled: {
						// after _onEnter execs, send "reset" input down the hierarchy
						_onEnter: function() {
							this.emit( "pedestrians", { status: DO_NOT_WALK } );
						},
						timeout: "pedestriansEnabled",
						_child: vehicleSignal
					},
					pedestriansEnabled: {
						_onEnter: function() {
							this.emit( "vehicles", { status: RED } );
						},
						timeout: "vehiclesEnabled",
						_child: function() {
							return pedestrianSignal;
						}
					}
				}
			}, options || {} ) );
			return crosswalk;
		},
		behavioralCrosswalkFactory: function( options ) {
			// Child FSM
			var vehicleSignal = new machina.BehavioralFsm( {
				namespace: "vehicle-signal",
				initialState: "uninitialized",
				reset: function( client ) {
					this.transition( client, "green" );
				},
				states: {
					uninitialized: {
						"*": function( client ) {
							this.deferUntilTransition( client );
							this.transition( client, "green" );
						}
					},
					green: {
						_onEnter: function( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 30000 );
							this.emit( "vehicles", { status: GREEN, client: client } );
						},
						timeout: "green-interruptible",
						pedestrianWaiting: function( client ) {
							this.deferUntilTransition( client, "green-interruptible" );
						},
						_onExit: function( client ) {
							clearTimeout( client.timer );
						}
					},
					"green-interruptible": {
						pedestrianWaiting: "yellow"
					},
					yellow: {
						_onEnter: function( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 5000 );
							this.emit( "vehicles", { status: YELLOW, client: client } );
						},
						_reset: "green",
						_onExit: function( client ) {
							clearTimeout( client.timer );
						}
					}
				}
			} );

			// Child FSM
			var pedestrianSignal = new machina.BehavioralFsm( {
				namespace: "pedestrian-signal",
				initialState: "uninitialized",
				reset: function( client ) {
					this.transition( client, "walking" );
				},
				states: {
					uninitialized: {
						"*": function( client ) {
							this.deferUntilTransition( client );
							this.transition( client, "walking" );
						}
					},
					walking: {
						_onEnter: function( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 30000 );
							this.emit( "pedestrians", { status: WALK, client: client } );
						},
						timeout: "flashing",
						_onExit: function( client ) {
							clearTimeout( client.timer );
						}
					},
					flashing: {
						_onEnter: function( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 5000 );
							this.emit( "pedestrians", { status: DO_NOT_WALK, flashing: true, client: client } );
						},
						_reset: "walking",
						_onExit: function( client ) {
							clearTimeout( client.timer );
						}
					}
				}
			} );

			// Parent FSM
			return new machina.BehavioralFsm( _.merge( {}, {
					namespace: "crosswalk",
					initialState: "uninitialized",
					states: {
						uninitialized: {
							start: "vehiclesEnabled"
						},
						vehiclesEnabled: {
							_onEnter: function( client ) {
								this.emit( "pedestrians", { status: DO_NOT_WALK, client: client } );
							},
							timeout: "pedestriansEnabled",
							_child: vehicleSignal
						},
						pedestriansEnabled: {
							_onEnter: function( client ) {
								this.emit( "vehicles", { status: RED, client: client } );
							},
							timeout: "vehiclesEnabled",
							_child: pedestrianSignal
						}
					}
				}, options || {} ) );
		}
	};
};
