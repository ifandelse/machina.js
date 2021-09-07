const { sinon, } = global;

describe( "emitter", () => {
	let	instance,
		emitter,
		emitterInstance,
		childInstanceStub,
		utils,
		mockInstance,
		clientMeta,
		result;

	beforeEach( () => {
		childInstanceStub = {
			instance: { namespace: "child.fsm", },
		};
		utils = {
			getDefaultBehavioralOptions: sinon.stub().returns(),
			getChildFsmInstance: sinon.stub().returns( childInstanceStub ),
			listenToChild: sinon.stub().returns( "LISTENING" ),
			getDefaultClientMeta: sinon.stub().returns( { defaultMeta: true, } ),
			createUUID: sinon.stub().returns(),
			extend: sinon.stub().returns(),
		};

		emitterInstance = {};

		emitter = {
			getInstance: sinon.stub().returns( emitterInstance ),
			instance: emitterInstance,
		};

		instance = global.proxyquire( "../src/BehavioralFsm", {
			"./utils": { utils, },
			"./emitter": emitter,
		} );
	} );

	describe( "when creating an instance", () => {
		it( "should extend options over the instance" );
		it( "should set default values" );
		it( "should call initialize" );
		it( "should emit a NEW_FSM event" );
		it( "should set the extend static prop" );
	} );

	describe( "initClient", () => {
		describe( "when initial state is not provided", () => {
			beforeEach( () => {
				mockInstance = {};
			} );

			it( "should throw an error", () => {
				( function() {
					instance.BehavioralFsm.prototype.initClient.call( mockInstance, "CLIENT" );
				} ).should.throw( "You must specify an initial state for this FSM" );
			} );
		} );

		describe( "when an invalid initial state is provided", () => {
			beforeEach( () => {
				mockInstance = {
					initialState: "calzoom",
					states: {
						readyForCalzone: {},
						calzone: {},
						awaitingMoreCalzone: {},
					},
				};
			} );

			it( "should throw an error", () => {
				( function() {
					instance.BehavioralFsm.prototype.initClient.call( mockInstance, "CLIENT" );
				} ).should.throw( "The initial state specified does not exist in the states object." );
			} );
		} );

		describe( "when a valid initial state is provided", () => {
			beforeEach( () => {
				mockInstance = {
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						calzone: {},
						awaitingMoreCalzone: {},
					},
					transition: sinon.stub(),
				};
				instance.BehavioralFsm.prototype.initClient.call( mockInstance, "CLIENT" );
			} );

			it( "should call transition", () => {
				mockInstance.transition.should.be.calledOnceWithExactly( "CLIENT", "readyForCalzone" );
			} );
		} );
	} );

	describe( "configForState", () => {
		let listener;
		describe( "when it's not hierarchical", () => {
			beforeEach( () => {
				listener = sinon.stub();

				mockInstance = {
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						calzone: {},
						awaitingMoreCalzone: {},
					},
					hierarchy: {
						readyForCalzone: { off: listener, },
						totallyNotFunction: "wat",
					},
				};
				result = instance.BehavioralFsm.prototype.configForState.call( mockInstance, "calzone" );
			} );

			it( "should call off on any existing child listeners", () => {
				listener.should.be.calledOnce();
			} );

			it( "should return undefined", () => {
				( result === undefined ).should.be.true();
			} );
		} );

		describe( "when it's hierarchical", () => {
			beforeEach( () => {
				listener = sinon.stub();

				mockInstance = {
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						calzone: {
							_child: {},
						},
						awaitingMoreCalzone: {},
					},
					hierarchy: {
						readyForCalzone: { off: listener, },
						totallyNotFunction: "wat",
					},
				};
				result = instance.BehavioralFsm.prototype.configForState.call( mockInstance, "calzone" );
			} );

			it( "should call off on any existing child listeners", () => {
				listener.should.be.calledOnce();
			} );

			it( "should listen to the new child state", () => {
				utils.listenToChild.should.be.calledOnceWithExactly( mockInstance, childInstanceStub.instance );
			} );

			it( "should add the child namespace to the hierarchy property", () => {
				mockInstance.hierarchy[ "child.fsm" ].should.eql( "LISTENING" );
			} );

			it( "should return the child", () => {
				result.should.equal( childInstanceStub.instance );
			} );
		} );
	} );

	describe( "ensureClientMeta", () => {
		let clientArg;

		describe( "when the arg is not an object", () => {
			it( "should throw an error", () => {
				( function() {
					instance.BehavioralFsm.prototype.ensureClientMeta.call( mockInstance, "calzone" );
				} ).should.throw( "An FSM client must be an object." );
			} );
		} );

		describe( "when the namespace is not present", () => {
			beforeEach( () => {
				clientArg = {};
				mockInstance = {
					namespace: "name.space",
					initClient: sinon.stub(),
				};
				result = instance.BehavioralFsm.prototype.ensureClientMeta.call( mockInstance, clientArg );
			} );

			it( "should call initClient", () => {
				mockInstance.initClient.should.be.calledOnceWithExactly( clientArg );
			} );

			it( "should return the client meta", () => {
				result.should.eql( { defaultMeta: true, } );
			} );
		} );

		describe( "when the namespace is already present", () => {
			let alreadyInitdClient;

			beforeEach( () => {
				alreadyInitdClient = { alreadyInitd: true, };
				clientArg = {
					__machina__: {
						"name.space": alreadyInitdClient,
					},
				};
				mockInstance = {
					namespace: "name.space",
					initClient: sinon.stub(),
				};
				result = instance.BehavioralFsm.prototype.ensureClientMeta.call( mockInstance, clientArg );
			} );

			it( "should not call initClient", () => {
				mockInstance.initClient.should.not.be.called();
			} );

			it( "should return the client meta", () => {
				result.should.eql( alreadyInitdClient );
			} );
		} );
	} );

	describe( "buildEventPayload", () => {
		describe( "when the data is a plain object", () => {
			beforeEach( () => {
				mockInstance = {
					namespace: "cal.zone",
				};
				result = instance.BehavioralFsm.prototype.buildEventPayload.call( mockInstance, { clientArg: true, }, { stuff: "things", } );
			} );

			it( "should extend the client & namespace over the data and return it", () => {
				result.should.eql( {
					namespace: "cal.zone",
					client: { clientArg: true, },
					stuff: "things",
				} );
			} );
		} );

		describe( "when the data is not a plain object", () => {
			beforeEach( () => {
				mockInstance = {
					namespace: "cal.zone",
				};
				result = instance.BehavioralFsm.prototype.buildEventPayload.call( mockInstance, { clientArg: true, }, "delicious carbonara" );
			} );

			it( "should return an object with client, data, and namespace", () => {
				result.should.eql( {
					namespace: "cal.zone",
					client: { clientArg: true, },
					data: "delicious carbonara",
				} );
			} );
		} );

		describe( "when the data is falsy", () => {
			beforeEach( () => {
				mockInstance = {
					namespace: "cal.zone",
				};
				result = instance.BehavioralFsm.prototype.buildEventPayload.call( mockInstance, { clientArg: true, }, undefined );
			} );

			it( "should return an object with client, data, and namespace", () => {
				result.should.eql( {
					namespace: "cal.zone",
					client: { clientArg: true, },
					data: null,
				} );
			} );
		} );
	} );

	describe( "getHandlerArgs", () => {
		describe( "when isCatchAll is true", () => {
			describe( "when the input is an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", { inputType: "calzone", }, "carbonara", ], true );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"calzone",
						"carbonara",
					] );
				} );
			} );

			describe( "when the input is not an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", "calzone", "carbonara", ], true );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"calzone",
						"carbonara",
					] );
				} );
			} );
		} );

		describe( "when isCatchAll is false", () => {
			describe( "when the input is an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", { inputType: "calzone", }, "carbonara", ], false );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"carbonara",
					] );
				} );
			} );

			describe( "when the input is not an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", "calzone", "carbonara", ], false );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"carbonara",
					] );
				} );
			} );
		} );
	} );

	describe( "getSystemHandlerArgs", () => {
		it( "should return the given client and args in a single array", () => {
			instance.BehavioralFsm.prototype.getSystemHandlerArgs.call( mockInstance, [ "cal", "zone", ], "CLIENT" ).should.eql( [
				"CLIENT",
				"cal",
				"zone",
			] );
		} );
	} );

	describe( "handle", () => {
		describe( "when the input is undefined", () => {
			it( "should throw an error" );
		} );

		describe( "when input is a string", () => {
			describe( "when inExitHandler is false", () => {
				describe( "with a child, no pending delegations and not bubbling", () => {
					it( "should use an existing ticket number if present" );
					it( "should update the pendingDelegations prop" );
					it( "should call handle on the child" );
					it( "should return the result" );
				} );

				describe( "with a child, no pending delegations & bubbling", () => {
					it( "should remove any pending delegations" );
					it( "should emit a HANDLING event" );
					it( "should call the handler if a function is provided" );
					it( "should emit a HANDLED event" );
					it( "should update clientMeta props" );
				} );

				describe( "with a child, pending delegations and not bubbling", () => {
					it( "should emit a NO_HANDLER event if not handler is found" );
				} );
			} );

			describe( "when inExitHandler is true", () => {
				it( "should return undefined" );
			} );
		} );

		describe( "when input is an object", () => {
			describe( "when inExitHandler is false", () => {
				describe( "with a child, no pending delegations and not bubbling", () => {
					it( "should create a ticket number if one is not present" );
					it( "should update the pendingDelegations prop" );
					it( "should call handle on the child" );
					it( "should return the result" );
				} );

				describe( "when a child, no pending delegations & bubbling", () => {
					it( "should emit a HANDLING event" );
					it( "should call transition if a string state name is provided for the handler" );
					it( "should emit a HANDLED event" );
					it( "should update clientMeta props" );
				} );

				describe( "with a child, pending delegations and not bubbling", () => {
					it( "should emit a HANDLING event" );
					it( "should call transition if a string state name is provided for the handler" );
					it( "should emit a HANDLED event" );
					it( "should update clientMeta props" );
				} );
			} );

			describe( "when inExitHandler is true", () => {
				it( "should return undefined" );
			} );
		} );
	} );

	describe( "transition", () => {
		describe( "when we're in an exit handler", () => {
			it( "should not transition" );
		} );

		describe( "when the new state is the same as the current state", () => {
			it( "should not transition" );
		} );

		describe( "when an invalid state is passed", () => {
			it( "should not transition" );
			it( "should emit an invalid state event" );
		} );

		describe( "when the new state is one we can transition into", () => {
			describe( "when the state we're exiting has an onExit handler", () => {
				it( "should invoke the exit handler" );
				it( "should set the new and prior state properties" );
				it( "should emit a transition event" );
				it( "should emit a transitioned event" );
			} );

			describe( "when the state we're entering as an onEnter handler", () => {
				it( "should set the new and prior state properties" );
				it( "should emit a transition event" );
				it( "should invoke the onEnter handler" );
				it( "should emit a transitioned event" );
			} );

			describe( "when the FSM is hierarchical", () => {
				it( "should handle _reset on the child" );
			} );

			describe( "when the FSM has inputs queued to replay", () => {
				it( "should call processQueue" );
			} );
		} );
	} );

	describe( "deferUntilTransition", () => {
		describe( "when the input can be deferred", () => {
			describe( "when the stateName arg is not an array", () => {
				beforeEach( () => {
					clientMeta = {
						currentActionArgs: [ "ARG1", "ARG2", ],
						inputQueue: [],
					};

					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
					};
					result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT", "calzone" );
				} );

				it( "should call ensureClientMeta", () => {
					mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
				} );

				it( "should add the input to the client's queue", () => {
					clientMeta.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "calzone", ],
							args: [ "ARG1", "ARG2", ],
						},
					] );
				} );

				it( "should emit a deferred event", () => {
					mockInstance.emit.should.be.calledOnceWithExactly( "deferred", "EVENT_PAYLOAD" );
				} );
			} );

			describe( "when the stateName arg is an array", () => {
				beforeEach( () => {
					clientMeta = {
						currentActionArgs: [ "ARG1", "ARG2", ],
						inputQueue: [],
					};

					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
					};
					result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT", [ "calzone", "carbonara", ] );
				} );

				it( "should call ensureClientMeta", () => {
					mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
				} );

				it( "should add the input to the client's queue", () => {
					clientMeta.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "calzone", "carbonara", ],
							args: [ "ARG1", "ARG2", ],
						},
					] );
				} );

				it( "should emit a deferred event", () => {
					mockInstance.emit.should.be.calledOnceWithExactly( "deferred", "EVENT_PAYLOAD" );
				} );
			} );
		} );

		describe( "when the input cannot be deferred", () => {
			beforeEach( () => {
				clientMeta = {
					currentActionArgs: undefined,
					inputQueue: [],
				};

				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
					emit: sinon.stub(),
				};
				result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT", [ "calzone", "carbonara", ] );
			} );

			it( "should not add the input to the client's queue", () => {
				clientMeta.inputQueue.length.should.equal( 0 );
			} );

			it( "should not emit a deferred event", () => {
				mockInstance.emit.should.not.be.called();
			} );
		} );
	} );

	describe( "deferAndTransition", () => {
		beforeEach( () => {
			mockInstance = {
				deferUntilTransition: sinon.stub(),
				transition: sinon.stub(),
			};
			result = instance.BehavioralFsm.prototype.deferAndTransition.call( mockInstance, "CLIENT", "calzone" );
		} );

		it( "should call deferUntilTransition", () => {
			mockInstance.deferUntilTransition.should.be.calledOnceWithExactly( "CLIENT", "calzone" );
		} );

		it( "should call transition", () => {
			mockInstance.transition.should.be.calledOnceWithExactly( "CLIENT", "calzone" );
		} );
	} );

	describe( "processQueue", () => {
		beforeEach( () => {
			clientMeta = {
				state: "calzone",
				inputQueue: [
					{ untilState: [ "calzone", ], args: [ "arg1", "arg2", ], },
					{ untilState: [ "carbonara", ], args: [ "arg1", "arg2", ], },
					{ untilState: [ "calzone", "carbonara", ], args: [ "arg3", "arg4", ], },
				],
			};
			mockInstance = {
				ensureClientMeta: sinon.stub().returns( clientMeta ),
				handle: sinon.stub(),
			};
			result = instance.BehavioralFsm.prototype.processQueue.call( mockInstance, "CLIENT" );
		} );

		it( "should call ensureClientMeta", () => {
			mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
		} );

		it( "should update the inputQueue", () => {
			clientMeta.inputQueue.should.eql( [
				{ untilState: [ "carbonara", ], args: [ "arg1", "arg2", ], },
			] );
		} );

		it( "should process the queued inputs, calling handle for each one", () => {
			mockInstance.handle.should.be.calledTwice();
			mockInstance.handle.getCall( 0 ).should.be.calledWithExactly( "CLIENT", "arg1", "arg2" );
			mockInstance.handle.getCall( 1 ).should.be.calledWithExactly( "CLIENT", "arg3", "arg4" );
		} );
	} );

	describe( "clearQueue", () => {
		describe( "when not passing a state name", () => {
			beforeEach( () => {
				clientMeta = {
					inputQueue: [ "queued", "inputs", ],
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
				};
				result = instance.BehavioralFsm.prototype.clearQueue.call( mockInstance, "CLIENT" );
			} );

			it( "should clear all queued inputs", () => {
				clientMeta.inputQueue.length.should.equal( 0 );
			} );
		} );

		describe( "when passing a state name", () => {
			beforeEach( () => {
				clientMeta = {
					inputQueue: [
						{ untilState: [ "calzone", "carbonara", ], },
						{ untilState: [ "calzone", "carbonara", ], },
						{ untilState: [ "cheesecake", "carbonara", ], },
						{ untilState: [ "calzone", ], },
					],
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
				};
				result = instance.BehavioralFsm.prototype.clearQueue.call( mockInstance, "CLIENT", "calzone" );
			} );

			it( "should clear on queued inputs related to that state", () => {
				clientMeta.inputQueue.should.eql( [
					{ untilState: [ "carbonara", ], },
					{ untilState: [ "carbonara", ], },
					{ untilState: [ "cheesecake", "carbonara", ], },
				] );
			} );
		} );
	} );

	describe( "compositeState", () => {
		describe( "when the FSM is hierarchical", () => {
			beforeEach( () => {
				clientMeta = {
					state: "STATEY-STATE-STATE",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					states: {
						"STATEY-STATE-STATE": {
							_child: {
								instance: {
									compositeState: sinon.stub().returns( "COMPOSITE.STATE" ),
								},
							},
						},
					},
				};
				result = instance.BehavioralFsm.prototype.compositeState.call( mockInstance, "CLIENT" );
			} );

			it( "should ensure client meta", () => {
				mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
			} );

			it( "should call compositeState on the child instance", () => {
				mockInstance.states[ "STATEY-STATE-STATE" ]._child.instance.compositeState.should.be.calledOnceWithExactly( "CLIENT" );
			} );

			it( "should return the expected string state value", () => {
				result.should.eql( "STATEY-STATE-STATE.COMPOSITE.STATE" );
			} );
		} );

		describe( "when the FSM is not hierarchical", () => {
			beforeEach( () => {
				clientMeta = {
					state: "STATEY-STATE-STATE",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					states: {
						"STATEY-STATE-STATE": {},
					},
				};
				result = instance.BehavioralFsm.prototype.compositeState.call( mockInstance, "CLIENT" );
			} );

			it( "should ensure client meta", () => {
				mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
			} );

			it( "should return the expected string state value", () => {
				result.should.eql( "STATEY-STATE-STATE" );
			} );
		} );
	} );
} );
