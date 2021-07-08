/* eslint-disable no-magic-numbers */
const _ = require( "lodash" );

module.exports = function( machina ) {
	const DO_NOT_WALK = "Do Not Walk";
	const WALK = "Walk";
	const RED = "red";
	const YELLOW = "yellow";
	const GREEN = "green";

	return {
		crosswalkFactory( options ) {
			// Child FSM
			const vehicleSignal = new machina.Fsm( {
				namespace: "vehicle-signal",
				initialState: "uninitialized",
				reset() {
					this.transition( "green" );
				},
				states: {
					uninitialized: {
						"*"() {
							this.deferUntilTransition();
							this.transition( "green" );
						},
					},
					green: {
						_onEnter() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 30000 );
							this.emit( "vehicles", { status: GREEN, } );
						},
						timeout: "green-interruptible",
						pedestrianWaiting() {
							this.deferUntilTransition( "green-interruptible" );
						},
						_onExit() {
							clearTimeout( this.timer );
						},
					},
					"green-interruptible": {
						pedestrianWaiting: "yellow",
					},
					yellow: {
						_onEnter() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 5000 );
							this.emit( "vehicles", { status: YELLOW, } );
						},
						_reset: "green",
						_onExit() {
							clearTimeout( this.timer );
						},
					},
				},
			} );

			// Child FSM
			const pedestrianSignal = new machina.Fsm( {
				namespace: "pedestrian-signal",
				initialState: "uninitialized",
				reset() {
					this.transition( "walking" );
				},
				states: {
					uninitialized: {
						"*"() {
							this.deferUntilTransition();
							this.transition( "walking" );
						},
					},
					walking: {
						_onEnter() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 30000 );
							this.emit( "pedestrians", { status: WALK, } );
						},
						timeout: "flashing",
						_onExit() {
							clearTimeout( this.timer );
						},
					},
					flashing: {
						_onEnter() {
							this.timer = setTimeout( function() {
								this.handle( "timeout" );
							}.bind( this ), 5000 );
							this.emit( "pedestrians", { status: DO_NOT_WALK, flashing: true, } );
						},
						_reset: "walking",
						_onExit() {
							clearTimeout( this.timer );
						},
					},
				},
			} );

			// Parent FSM
			const crosswalk = new machina.Fsm( _.merge( {
				namespace: "crosswalk",
				initialState: "vehiclesEnabled",
				states: {
					vehiclesEnabled: {
						// after _onEnter execs, send "reset" input down the hierarchy
						_onEnter() {
							this.emit( "pedestrians", { status: DO_NOT_WALK, } );
						},
						timeout: "pedestriansEnabled",
						_child: vehicleSignal,
					},
					pedestriansEnabled: {
						_onEnter() {
							this.emit( "vehicles", { status: RED, } );
						},
						timeout: "vehiclesEnabled",
						_child() {
							return pedestrianSignal;
						},
					},
				},
			}, options || {} ) );
			return crosswalk;
		},
		behavioralCrosswalkFactory( options ) {
			// Child FSM
			const vehicleSignal = new machina.BehavioralFsm( {
				namespace: "vehicle-signal",
				initialState: "uninitialized",
				reset( client ) {
					this.transition( client, "green" );
				},
				states: {
					uninitialized: {
						"*"( client ) {
							this.deferUntilTransition( client );
							this.transition( client, "green" );
						},
					},
					green: {
						_onEnter( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 30000 );
							this.emit( "vehicles", { status: GREEN, client, } );
						},
						timeout: "green-interruptible",
						pedestrianWaiting( client ) {
							this.deferUntilTransition( client, "green-interruptible" );
						},
						_onExit( client ) {
							clearTimeout( client.timer );
						},
					},
					"green-interruptible": {
						pedestrianWaiting: "yellow",
					},
					yellow: {
						_onEnter( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 5000 );
							this.emit( "vehicles", { status: YELLOW, client, } );
						},
						_reset: "green",
						_onExit( client ) {
							clearTimeout( client.timer );
						},
					},
				},
			} );

			// Child FSM
			const pedestrianSignal = new machina.BehavioralFsm( {
				namespace: "pedestrian-signal",
				initialState: "uninitialized",
				reset( client ) {
					this.transition( client, "walking" );
				},
				states: {
					uninitialized: {
						"*"( client ) {
							this.deferUntilTransition( client );
							this.transition( client, "walking" );
						},
					},
					walking: {
						_onEnter( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 30000 );
							this.emit( "pedestrians", { status: WALK, client, } );
						},
						timeout: "flashing",
						_onExit( client ) {
							clearTimeout( client.timer );
						},
					},
					flashing: {
						_onEnter( client ) {
							client.timer = setTimeout( function() {
								this.handle( client, "timeout" );
							}.bind( this ), 5000 );
							this.emit( "pedestrians", { status: DO_NOT_WALK, flashing: true, client, } );
						},
						_reset: "walking",
						_onExit( client ) {
							clearTimeout( client.timer );
						},
					},
				},
			} );

			// Parent FSM
			return new machina.BehavioralFsm( _.merge( {}, {
				namespace: "crosswalk",
				initialState: "uninitialized",
				states: {
					uninitialized: {
						start: "vehiclesEnabled",
					},
					vehiclesEnabled: {
						_onEnter( client ) {
							this.emit( "pedestrians", { status: DO_NOT_WALK, client, } );
						},
						timeout: "pedestriansEnabled",
						_child: vehicleSignal,
					},
					pedestriansEnabled: {
						_onEnter( client ) {
							this.emit( "vehicles", { status: RED, client, } );
						},
						timeout: "vehiclesEnabled",
						_child: pedestrianSignal,
					},
				},
			}, options || {} ) );
		},
	};
};
/* eslint-enable no-magic-numbers */
