const _ = require( "lodash" );
const sinon = require( "sinon" );
const machina = require( "../lib/machina.js" );
const hierarchical = require( "./helpers/hierarchicalFsm.js" )( machina );

describe( "Hierarchical machina.Fsm", function() {
	describe( "when creating a hierarchy", function() {
		let crosswalk;
		const events = [];
		before( function() {
			crosswalk = hierarchical.crosswalkFactory( {
				eventListeners: {
					"*": [ function( eventName, data ) {
						events.push( { name: eventName, data, } );
					},
					],
				},
			} );
			crosswalk.states.pedestriansEnabled._child().emit( "FakeEvent", { foo: "bar", } );
		} );
		it( "should report correct starting state for parent FSM", function() {
			crosswalk.state.should.equal( "vehiclesEnabled" );
			crosswalk.compositeState().should.equal( "vehiclesEnabled.green" );
		} );
		it( "should emit a 'pedestrians - do not walk' event", function() {
			events[ 1 ].should.eql( { name: "pedestrians", data: { status: "Do Not Walk", }, } );
		} );
		it( "should report correct starting state for child FSM of active parent state", function() {
			crosswalk.states.vehiclesEnabled._child.instance.state.should.equal( "green" );
		} );
		it( "should issue reset input to child FSM of active parent state", function() {
			events[ 3 ].should.eql( {
				name: "handling",
				data: {
					inputType: "_reset",
					delegated: false,
					ticket: undefined,
					namespace: "vehicle-signal",
				},
			} );
		} );
		it( "should emit a 'vehicles - green' event", function() {
			events[ 6 ].should.eql( { name: "vehicles", data: { status: "green", }, } );
		} );
		it( "should not be listening to any events from child FSM of inactive parent state", function() {
			_.some( events, function( item ) {
				return item.name === "FakeEvent";
			} ).should.equal( false );
		} );
	} );
	describe( "when feeding input to a hierarchical FSM", function() {
		describe( "and the input originates from timer in child", function() {
			let crosswalk;
			let events = [];
			before( function() {
				this.clock = sinon.useFakeTimers(); // eslint-disable-line no-invalid-this
				crosswalk = hierarchical.crosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
							events.push( { name: eventName, data, } );
						},
						],
					},
				} );
				events = [];
				this.clock.tick( 35000 ); // eslint-disable-line no-invalid-this
				this.clock.restore(); // eslint-disable-line no-invalid-this
			} );
			it( "should handle input in child FSM", function() {
				events[ 0 ].should.eql( {
					name: "handling",
					data: {
						inputType: "timeout",
						delegated: false,
						ticket: undefined,
						namespace: "vehicle-signal",
					},
				} );
			} );
			it( "should result in child FSM transitioning", function() {
				events[ 1 ].should.eql( {
					name: "transition",
					data: {
						fromState: "green",
						action: "green.timeout",
						toState: "green-interruptible",
						namespace: "vehicle-signal",
					},
				} );
				crosswalk.states.vehiclesEnabled._child.instance.state.should.equal( "green-interruptible" );
				crosswalk.compositeState().should.equal( "vehiclesEnabled.green-interruptible" );
			} );
			it( "should not change parent FSM's state", function() {
				crosswalk.state.should.equal( "vehiclesEnabled" );
			} );
		} );
		describe( "and the input originates from parent FSM", function() {
			let crosswalk;
			let events = [];
			before( function() {
				this.clock = sinon.useFakeTimers(); // eslint-disable-line no-invalid-this
				crosswalk = hierarchical.crosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
							events.push( { name: eventName, data, } );
						},
						],
					},
				} );
				this.clock.tick( 35000 ); // eslint-disable-line no-invalid-this
				events = [];
				crosswalk.handle( "pedestrianWaiting" );
				this.clock.restore(); // eslint-disable-line no-invalid-this
			} );
			it( "should delegate input to the child FSM", function() {
				events[ 0 ].name.should.eql( "handling" );
				events[ 0 ].data.inputType.should.eql( "pedestrianWaiting" );
				events[ 0 ].data.delegated.should.eql( true );
				events[ 0 ].data.namespace.should.eql( "vehicle-signal" );
				events[ 0 ].data.ticket.should.be.a( "string" );
			} );
			it( "should transition child FSM", function() {
				events[ 1 ].should.eql( {
					name: "transition",
					data: {
						fromState: "green-interruptible",
						action: "green-interruptible.pedestrianWaiting",
						toState: "yellow",
						namespace: "vehicle-signal",
					},
				} );
				crosswalk.states.vehiclesEnabled._child.instance.state.should.equal( "yellow" );
				crosswalk.compositeState().should.equal( "vehiclesEnabled.yellow" );
			} );
			it( "should emit a 'vehicles - yellow' event", function() {
				events[ 2 ].should.eql( { name: "vehicles", data: { status: "yellow", }, } );
			} );
		} );
		describe( "and input isn't handled in child, but parent instead", function() {
			let crosswalk;
			let events = [];
			before( function() {
				this.clock = sinon.useFakeTimers(); // eslint-disable-line no-invalid-this
				crosswalk = hierarchical.crosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
							events.push( { name: eventName, data, } );
						},
						],
					},
				} );
				this.clock.tick( 35000 ); // eslint-disable-line no-invalid-this
				crosswalk.handle( "pedestrianWaiting" );
				events = [];
				this.clock.tick( 5000 ); // eslint-disable-line no-invalid-this
				this.clock.restore(); // eslint-disable-line no-invalid-this
			} );
			it( "should be handled by parent FSM", function() {
				events[ 0 ].should.eql( {
					name: "handling",
					data: {
						inputType: "timeout",
						delegated: false,
						ticket: undefined,
						namespace: "crosswalk",
					},
				} );
			} );
			it( "should cause parent FSM to transition", function() {
				events[ 1 ].should.eql( {
					name: "transition",
					data: {
						fromState: "vehiclesEnabled",
						action: "vehiclesEnabled.timeout",
						toState: "pedestriansEnabled",
						namespace: "crosswalk",
					},
				} );
				crosswalk.state.should.equal( "pedestriansEnabled" );
				crosswalk.compositeState().should.equal( "pedestriansEnabled.walking" );
			} );
			it( "should emit a 'vehicles - red' event", function() {
				events[ 2 ].should.eql( { name: "vehicles", data: { status: "red", }, } );
			} );
			it( "should have child FSM of active parent state handle _reset input", function() {
				events[ 4 ].should.eql( {
					name: "handling",
					data: {
						inputType: "_reset",
						delegated: false,
						ticket: undefined,
						namespace: "pedestrian-signal",
					},
				} );
			} );
			it( "should emit a 'pedestrians - walk' event", function() {
				events[ 7 ].should.eql( { name: "pedestrians", data: { status: "Walk", }, } );
			} );
		} );
		describe( "and parent FSM transitions into previously held state", function() {
			let crosswalk;
			let events = [];
			before( function() {
				this.clock = sinon.useFakeTimers(); // eslint-disable-line no-invalid-this
				crosswalk = hierarchical.crosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
							events.push( { name: eventName, data, } );
						},
						],
					},
				} );
				this.clock.tick( 35000 ); // eslint-disable-line no-invalid-this
				crosswalk.handle( "pedestrianWaiting" );
				events = [];
				this.clock.tick( 45000 ); // eslint-disable-line no-invalid-this
				this.clock.restore(); // eslint-disable-line no-invalid-this
			} );
			it( "should cause child FSM to handle a _reset input", function() {
				events[ 21 ].should.eql( {
					name: "transition",
					data: {
						fromState: "yellow",
						action: "yellow._reset",
						toState: "green",
						namespace: "vehicle-signal",
					},
				} );
			} );
			it( "should emit a 'vehicles - green' event", function() {
				events[ 22 ].should.eql( { name: "vehicles", data: { status: "green", }, } );
			} );
		} );
	} );
} );
