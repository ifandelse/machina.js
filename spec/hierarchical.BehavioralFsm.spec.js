describe( "Hierarchical machina.BehavioralFsm", function() {
	describe( "when creating a hierarchy", function() {
		var crosswalk;
		var events = [];
		var resetHandled = false;
		var client = {};
		before( function() {
			crosswalk = hierarchical.behavioralCrosswalkFactory( {
				eventListeners: {
					"*": [ function( eventName, data ) {
							events.push( { name: eventName, data: data } );
						}
					]
				}
			} );
			crosswalk.handle( client, "start" );
			crosswalk.states.pedestriansEnabled._child.emit( "FakeEvent", { foo: "bar" } );
		} );
		it( "should report correct starting state for parent FSM", function() {
			client.__machina__.crosswalk.state.should.equal( "vehiclesEnabled" );
			crosswalk.compositeState( client ).should.equal( "vehiclesEnabled.green" );
		} );
		it( "should emit a 'pedestrians - do not walk' event", function() {
			events[ 3 ].should.eql( { name: "pedestrians", data: { status: "Do Not Walk", client: client } } );
		} );
		it( "should report correct starting state for child FSM of active parent state", function() {
			client.__machina__[ "vehicle-signal" ].state.should.equal( "green" );
		} );
		it( "should issue reset input to child FSM of active parent state", function() {
			events[ 5 ].should.eql( {
				name: "handling",
				data: {
					inputType: "_reset",
					delegated: false,
					ticket: undefined,
					client: client,
					namespace: "vehicle-signal"
				}
			} );
		} );
		it( "should emit a 'vehicles - green' event", function() {
			events[ 8 ].should.eql( { name: "vehicles", data: { status: "green", client: client } } );
		} );
		it( "should not be listening to any events from child FSM of inactive parent state", function() {
			_.any( events, function( item ) {
				return item.name === "FakeEvent";
			} ).should.equal( false );
		} );
	} );
	describe( "when feeding input to a hierarchical FSM", function() {
		describe( "and the input originates from timer in child", function() {
			var crosswalk;
			var events = [];
			var resetHandled = false;
			var client = {};
			before( function() {
				this.clock = sinon.useFakeTimers();
				crosswalk = hierarchical.behavioralCrosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
								events.push( { name: eventName, data: data } );
							}
						]
					}
				} );
				crosswalk.handle( client, "start" );
				events = [];
				this.clock.tick( 35000 );
				this.clock.restore();
			} );
			it( "should handle input in child FSM", function() {
				events[ 0 ].should.eql( {
					name: "handling",
					data: {
						inputType: "timeout",
						delegated: false,
						ticket: undefined,
						client: client,
						namespace: "vehicle-signal"
					}
				} );
			} );
			it( "should result in child FSM transitioning", function() {
				events[ 1 ].should.eql( {
					name: "transition",
					data: {
						fromState: "green",
						action: "green.timeout",
						toState: "green-interruptible",
						client: client,
						namespace: "vehicle-signal"
					}
				} );
				client.__machina__[ "vehicle-signal" ].state.should.equal( "green-interruptible" );
				crosswalk.compositeState( client ).should.equal( "vehiclesEnabled.green-interruptible" );
			} );
			it( "should not change parent FSM's state", function() {
				client.__machina__.crosswalk.state.should.equal( "vehiclesEnabled" );
			} );
		} );
		describe( "and the input originates from parent FSM", function() {
			var crosswalk;
			var events = [];
			var resetHandled = false;
			var client = {};
			before( function() {
				this.clock = sinon.useFakeTimers();
				crosswalk = hierarchical.behavioralCrosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
								events.push( { name: eventName, data: data } );
							}
						]
					}
				} );
				crosswalk.handle( client, "start" );
				this.clock.tick( 35000 );
				events = [];
				crosswalk.handle( client, "pedestrianWaiting" );
				this.clock.restore();
			} );
			it( "should delegate input to the child FSM", function() {
				events[ 0 ].name.should.eql( "handling" );
				events[ 0 ].data.inputType.should.eql( "pedestrianWaiting" );
				events[ 0 ].data.delegated.should.eql( true );
				events[ 0 ].data.namespace.should.eql( "vehicle-signal" );
				events[ 0 ].data.ticket.should.be.String;
			} );
			it( "should transition child FSM", function() {
				events[ 1 ].should.eql( {
					name: "transition",
					data: {
						fromState: "green-interruptible",
						action: "green-interruptible.pedestrianWaiting",
						toState: "yellow",
						client: client,
						namespace: "vehicle-signal"
					}
				} );
				client.__machina__[ "vehicle-signal" ].state.should.equal( "yellow" );
				crosswalk.compositeState( client ).should.equal( "vehiclesEnabled.yellow" );
			} );
			it( "should emit a 'vehicles - yellow' event", function() {
				events[ 2 ].should.eql( { name: "vehicles", data: { status: "yellow", client: client } } );
			} );
		} );
		describe( "and input isn't handled in child, but parent instead", function() {
			var crosswalk;
			var events = [];
			var resetHandled = false;
			var client = {};
			before( function() {
				this.clock = sinon.useFakeTimers();
				crosswalk = hierarchical.behavioralCrosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
								events.push( { name: eventName, data: data } );
							}
						]
					}
				} );
				crosswalk.handle( client, "start" );
				this.clock.tick( 35000 );
				crosswalk.handle( client, "pedestrianWaiting" );
				events = [];
				this.clock.tick( 5000 );
				this.clock.restore();
			} );
			it( "should be handled by parent FSM", function() {
				events[ 0 ].should.eql( {
					name: "handling",
					data: {
						inputType: "timeout",
						delegated: false,
						ticket: undefined,
						client: client,
						namespace: "crosswalk"
					}
				} );
			} );
			it( "should cause parent FSM to transition", function() {
				events[ 1 ].should.eql( {
					name: "transition",
					data: {
						fromState: "vehiclesEnabled",
						action: "vehiclesEnabled.timeout",
						toState: "pedestriansEnabled",
						client: client,
						namespace: "crosswalk"
					}
				} );
				client.__machina__.crosswalk.state.should.equal( "pedestriansEnabled" );
				crosswalk.compositeState( client ).should.equal( "pedestriansEnabled.walking" );
			} );
			it( "should emit a 'vehicles - red' event", function() {
				events[ 2 ].should.eql( { name: "vehicles", data: { status: "red", client: client } } );
			} );
			it( "should have child FSM of active parent state handle _reset input", function() {
				events[ 4 ].should.eql( {
					name: "handling",
					data: {
						inputType: "_reset",
						delegated: false,
						ticket: undefined,
						client: client,
						namespace: "pedestrian-signal"
					}
				} );
			} );
			it( "should emit a 'pedestrians - walk' event", function() {
				events[ 7 ].should.eql( { name: "pedestrians", data: { status: "Walk", client: client } } );
			} );
		} );
		describe( "and parent FSM transitions into previously held state", function() {
			var crosswalk;
			var events = [];
			var resetHandled = false;
			var client = {};
			before( function() {
				this.clock = sinon.useFakeTimers();
				crosswalk = hierarchical.behavioralCrosswalkFactory( {
					eventListeners: {
						"*": [ function( eventName, data ) {
								events.push( { name: eventName, data: data } );
							}
						]
					}
				} );
				crosswalk.handle( client, "start" );
				this.clock.tick( 35000 );
				crosswalk.handle( client, "pedestrianWaiting" );
				events = [];
				this.clock.tick( 45000 );
				this.clock.restore();
			} );
			it( "should cause child FSM to handle a _reset input", function() {
				events[ 18 ].should.eql( {
					name: "transition",
					data: {
						fromState: "yellow",
						action: "yellow._reset",
						toState: "green",
						client: client,
						namespace: "vehicle-signal"
					}
				} );
			} );
			it( "should emit a 'vehicles - green' event", function() {
				events[ 19 ].should.eql( { name: "vehicles", data: { status: "green", client: client } } );
			} );
		} );
	} );
} );
