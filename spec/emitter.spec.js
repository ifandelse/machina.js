const { sinon, } = global;

describe( "emitter", () => {
	let	instance,
		listenerStub,
		origLog;

	beforeEach( () => {
		origLog = console.log;
		console.log = sinon.stub();
		listenerStub = sinon.stub();
		instance = global.proxyquire( "../src/emitter", {} ).instance;
	} );

	afterEach( () => {
		console.log = origLog;
	} );

	describe( "emit", () => {
		describe( "when wildcard listeners are present", () => {
			beforeEach( () => {
				instance.eventListeners = {
					"*": [ listenerStub, ],
				};
			} );

			describe( "with useSafeEmit=true", () => {
				beforeEach( () => {
					instance.useSafeEmit = true;
				} );

				describe( "when the callback does not throw", () => {
					beforeEach( () => {
						instance.emit( "so", "many", "args" );
					} );

					it( "should execute the callback", () => {
						listenerStub.should.be.calledWithExactly( "so", "many", "args" );
					} );

					it( "should not log an exception", () => {
						console.log.should.not.be.called();
					} );
				} );

				describe( "when the callback throws", () => {
					describe( "when console is falsy", () => {
						let origConsole;

						beforeEach( () => {
							origConsole = global.console;
							global.console = null;
							listenerStub.throws( new Error( "E_NO_CALZONE" ) );
							instance.emit( "so", "many", "args" );
						} );

						afterEach( () => {
							global.console = origConsole;
						} );

						it( "should execute the callback", () => {
							listenerStub.should.be.calledWithExactly( "so", "many", "args" );
						} );
					} );

					describe( "when console is truthy, but log is not", () => {
						beforeEach( () => {
							global.console.log = undefined;
							listenerStub.throws( new Error( "E_NO_CALZONE" ) );
							instance.emit( "so", "many", "args" );
						} );

						afterEach( () => {
							global.console.log = origLog;
						} );

						it( "should execute the callback", () => {
							listenerStub.should.be.calledWithExactly( "so", "many", "args" );
						} );
					} );

					describe( "when console.log is truthy", () => {
						let err;

						beforeEach( () => {
							err = new Error( "E_NO_CALZONE" );
							listenerStub.throws( err );
							instance.emit( "so", "many", "args" );
						} );

						it( "should log the error", () => {
							console.log.should.be.calledWithExactly( err.stack );
						} );
					} );
				} );
			} );
		} );

		describe( "when the event name has listeners", () => {
			describe( "with useSafeEmit=true", () => {
				describe( "when the callback does not throw", () => {
					it( "should execute the callback" );
					it( "should not log an exception" );
				} );

				describe( "when the callback throws", () => {
					describe( "when console is falsy", () => {
						it( "should do nothing" );
					} );

					describe( "when console is truthy, but log is not", () => {
						it( "should do nothing" );
					} );

					describe( "when console.log is truthy", () => {
						it( "should log the error" );
					} );
				} );
			} );
		} );

		describe( "when the event name has no listeners", () => {
			it( "should do nothing" );
		} );
	} );

	describe( "on", () => {
		let sub;

		describe( "when it's the first subscription for that event", () => {
			beforeEach( () => {
				sub = instance.on( "calzone", listenerStub );
			} );

			it( "should init the eventListeners prop", () => {
				instance.eventListeners.should.containSubset( {
					"*": [],
				} );
			} );

			it( "should init the listeners array for the event", () => {
				instance.eventListeners.should.containSubset( {
					calzone: [ listenerStub, ],
				} );
			} );

			it( "should return the expected object", () => {
				sub.eventName.should.equal( "calzone" );
				sub.callback.should.equal( listenerStub );
				sub.off.should.be.a( "function" );
			} );

			it( "should remove the listener if off() is called", () => {
				sub.off();
				instance.eventListeners.calzone.length.should.equal( 0 );
			} );
		} );

		describe( "when it's not the first subscription for that event", () => {
			beforeEach( () => {
				instance.on( "calzone", () => {} );
				sub = instance.on( "calzone", listenerStub );
			} );

			it( "should add the callback as a listener", () => {
				instance.eventListeners.calzone[ 1 ].should.equal( listenerStub );
			} );

			it( "should return the expected object", () => {
				sub.eventName.should.equal( "calzone" );
				sub.callback.should.equal( listenerStub );
				sub.off.should.be.a( "function" );
			} );

			it( "should remove the listener if off() is called", () => {
				sub.off();
				instance.eventListeners.calzone.length.should.equal( 1 );
			} );
		} );
	} );

	describe( "off", () => {
		beforeEach( () => {
			instance.on( "calzone", () => {} );
			instance.on( "calzone", listenerStub );
		} );

		describe( "when not passing an event name", () => {
			beforeEach( () => {
				instance.off();
			} );

			it( "should clear all listeners", () => {
				instance.eventListeners.should.eql( {} );
			} );
		} );

		describe( "when passing an event name with a callback", () => {
			beforeEach( () => {
				instance.off( "calzone", listenerStub );
			} );

			it( "should remove that specific callback for that event name", () => {
				instance.eventListeners.calzone.should.not.contain( listenerStub );
			} );
		} );

		describe( "when passing an event name with no callback", () => {
			beforeEach( () => {
				instance.off( "calzone" );
			} );

			it( "should clear all subscriptions for that event name", () => {
				instance.eventListeners.calzone.length.should.equal( 0 );
			} );
		} );
	} );
} );
