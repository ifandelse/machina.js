( function( global, $ ) {
	var DO_NOT_WALK = "Do Not Walk";
	var WALK = "Walk";
	var RED = "red";
	var YELLOW = "yellow";
	var GREEN = "green";
	var $content = $( "#content" );

	function writeToDom( eventName, data ) {
		$content.prepend( "<div class='event-item'><h3>" + eventName + "</h3><div><pre>" + JSON.stringify( data, null, 4 ) + "</pre></div>" );
	}

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
				timeout: "red",
				_onExit: function() {
					clearTimeout( this.timer );
				}
			},
			red: {
				_onEnter: function() {
					this.timer = setTimeout( function() {
						this.handle( "timeout" );
					}.bind( this ), 1000 );
				},
				_reset: "green",
				_onExit: function() {
					clearTimeout( this.timer );
				}
			}
		}
	} );

	// // Child FSM
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
				timeout: "dontwalk",
				_onExit: function() {
					clearTimeout( this.timer );
				}
			},
			dontwalk: {
				_onEnter: function() {
					this.timer = setTimeout( function() {
						this.handle( "timeout" );
					}.bind( this ), 1000 );
				},
				_reset: "walking",
				_onExit: function() {
					clearTimeout( this.timer );
				}
			}
		}
	} );

	// // Parent FSM
	var crosswalk = new machina.Fsm( {
		namespace: "crosswalk",
		initialState: "vehiclesEnabled",
		eventListeners: {
			"*": [ function( eventName, data ) {
					switch ( eventName ) {
						case "transition" :
							writeToDom( eventName, data );
							console.log( data.namespace, data.fromState, "->", data.toState );
							break;
						case "vehicles" :
							writeToDom( eventName, data );
							console.log( "vehicles", data.status );
							break;
						case "pedestrians":
							writeToDom( eventName, data );
							if ( data.flashing ) {
								console.log( "pedestrians", data.status, "(flashing)" );
							} else {
								console.log( "pedestrians", data.status );
							}
							break;
						default:

							break;
					}
				}
			]
		},
		states: {
			vehiclesEnabled: {
				// after _onEnter execs, send "reset" input down the hierarchy
				_onEnter: function() {
					this.emit( "pedestrians", { status: DO_NOT_WALK } );
				},
				timeout: "pedestriansEnabled",
				_child: vehicleSignal,
			},
			pedestriansEnabled: {
				_onEnter: function() {
					this.emit( "vehicles", { status: RED } );
				},
				timeout: "vehiclesEnabled",
				_child: pedestrianSignal
			}
		}
	} );

	global.app = {
		vehicleSignal: vehicleSignal,
		pedestrianSignal: pedestrianSignal,
		crosswalk: crosswalk
	};

	crosswalk.handle( "pedestrianWaiting" );
}( window, jQuery ) );
