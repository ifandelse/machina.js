const { sinon, } = global;

import { utils as _utils } from "../src/utils";

describe( "emitter", () => {
	let	instance,
		behavioralFsmModule,
		BehavioralFsm,
		extendSpy,
		emitterInstance,
		getEmitterInstance,
		sandbox,
		result,
		fsmInstance;

	beforeEach( () => {
		emitterInstance = {
			on: () => {},
			off: () => {},
			emit: () => {},
			eventListeners: {},
		};

		getEmitterInstance = sinon.stub().returns( {
			on: () => {},
			off: () => {},
			emit: () => {},
			eventListeners: {},
		} );

		behavioralFsmModule = global.proxyquire( "../src/BehavioralFsm", {
			lodash: require( "lodash" ),
			"./utils": { utils: _utils, },
			"./emitter": {
				instance: emitterInstance,
				getInstance: getEmitterInstance,
			},
			"./events": require( "../src/events" ),
		} );

		BehavioralFsm = behavioralFsmModule.BehavioralFsm;

		extendSpy = sinon.spy( BehavioralFsm, "extend" );

		instance = global.proxyquire( "../src/Fsm", {
			"./utils": { utils: _utils, },
			"./BehavioralFsm": { BehavioralFsm, },
		} );

		sandbox = sinon.createSandbox();
	} );

	afterEach( () => {
		sandbox.restore();
	} );

	describe( "constructor", () => {
		beforeEach( () => {
			fsmInstance = new instance.Fsm( {
				initialState: "readyForCalzone",
				states: {
					readyForCalzone: {},
					nomNomCalzone: {},
				},
			} );
		} );

		it( "should inherit from the BehavioralFsm constructor", () => {
			extendSpy.should.be.calledOnce.and.calledWithMatch( {
				constructor: sinon.match.func,
				initClient: sinon.match.func,
				ensureClientMeta: sinon.match.func,
				ensureClientArg: sinon.match.func,
				getHandlerArgs: sinon.match.func,
				getSystemHandlerArgs: sinon.match.func,
				buildEventPayload: sinon.match.func,
			} );
		} );

		it( "should call ensureClientMeta", () => {
			fsmInstance._stamped.should.be.true();
			fsmInstance.should.containSubset( {
				inputQueue: [],
				targetReplayState: "readyForCalzone",
				state: "readyForCalzone",
				priorState: undefined,
				priorAction: "",
				currentAction: "",
				currentActionArgs: undefined,
				inExitHandler: false,
			} );
		} );
	} );

	describe( "initClient", () => {
		describe( "when no initial state is defined", () => {
			it( "should throw an error", () => {
				( function() {
					fsmInstance = new instance.Fsm( {
						initialState: "",
						states: {
							readyForCalzone: {},
							nomNomCalzone: {},
						},
					} );
				} ).should.throw( "You must specify an initial state for this FSM" );
			} );
		} );

		describe( "when an invalid initial state is defined", () => {
			it( "should throw an error", () => {
				( function() {
					fsmInstance = new instance.Fsm( {
						initialState: "utopia",
						states: {
							readyForCalzone: {},
							nomNomCalzone: {},
						},
					} );
				} ).should.throw( "The initial state specified does not exist in the states object." );
			} );
		} );

		describe( "when a valid initial state is defined", () => {
			beforeEach( () => {
				fsmInstance = new instance.Fsm( {
					initialize() {
						sandbox.spy( this );
					},
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						nomNomCalzone: {},
					},
				} );
			} );

			it( "should call transition", () => {
				fsmInstance.transition.should.be.calledOnceWithExactly( "readyForCalzone" );
			} );
		} );
	} );

	describe( "ensureClientMeta", () => {
		describe( "when the instance has not been 'stamped'", () => {
			beforeEach( () => {
				fsmInstance = new instance.Fsm( {
					initialize() {
						sandbox.spy( this );
					},
					initialState: "bakingTheCheesecake",
					states: {
						bakingTheCheesecake: {},
						devouringTheCheesecake: {},
					},
				} );
			} );

			it( "should mark the instance as stamped", () => {
				fsmInstance._stamped.should.be.true();
			} );

			it( "should apply default client meta to the instance", () => {
				fsmInstance.should.containSubset( {
					inputQueue: [],
					targetReplayState: "bakingTheCheesecake",
					state: "bakingTheCheesecake",
					priorState: undefined,
					priorAction: "",
					currentAction: "",
					currentActionArgs: undefined,
					inExitHandler: false,
				} );
			} );

			it( "should call initClient", () => {
				fsmInstance.initClient.should.be.calledOnceWithExactly();
			} );
		} );
	} );

	describe( "ensureClientArg", () => {
		beforeEach( () => {
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {},
					devouringTheCheesecake: {},
				},
			} );
		} );

		describe( "when splicing the instance into the args array", () => {
			beforeEach( () => {
				result = fsmInstance.ensureClientArg( [ {}, "arg1", "arg2", ] );
			} );

			it( "should return the expected args", () => {
				result.should.eql( [ fsmInstance, "arg1", "arg2", ] );
			} );
		} );

		describe( "when unshifting the instance into the args array", () => {
			describe( "when the first arg is not an object", () => {
				beforeEach( () => {
					result = fsmInstance.ensureClientArg( [ "arg1", "arg2", ] );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [ fsmInstance, "arg1", "arg2", ] );
				} );
			} );

			describe( "when the first arg is an object that contains the inputType prop", () => {
				beforeEach( () => {
					result = fsmInstance.ensureClientArg( [ { inputType: "eatDessert", }, "arg1", "arg2", ] );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [ fsmInstance, { inputType: "eatDessert", }, "arg1", "arg2", ] );
				} );
			} );
		} );
	} );

	describe( "getHandlerArgs", () => {
		beforeEach( () => {
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {},
					devouringTheCheesecake: {},
				},
			} );
		} );

		describe( "when we're in the catch all handler", () => {
			describe( "when input type is not an object", () => {
				beforeEach( () => {
					result = fsmInstance.getHandlerArgs( [
						{},
						"inputTypeArg",
						"arg2",
					], true );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"inputTypeArg", "arg2",
					] );
				} );
			} );

			describe( "when input type is an object", () => {
				beforeEach( () => {
					result = fsmInstance.getHandlerArgs( [
						{},
						{ inputType: "inputTypeArg", },
						"arg2",
					], true );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"inputTypeArg", "arg2",
					] );
				} );
			} );
		} );

		describe( "when we're not in the catch all handler", () => {
			beforeEach( () => {
				result = fsmInstance.getHandlerArgs( [ {}, "inputTypeArg", "arg2", ], false );
			} );

			it( "should return the expected args", () => {
				result.should.eql( [ "arg2", ] );
			} );
		} );
	} );

	describe( "getSystemHandlerArgs", () => {
		beforeEach( () => {
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {},
					devouringTheCheesecake: {},
				},
			} );
			result = fsmInstance.getSystemHandlerArgs( [ "arg1", "arg2", ] );
		} );

		it( "should just return the passed args", () => {
			result.should.eql( [ "arg1", "arg2", ] );
		} );
	} );

	describe( "buildEventPayload", () => {
		beforeEach( () => {
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				namespace: "fsm.test",
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {
						startEating: "devouringTheCheesecake",
					},
					devouringTheCheesecake: {},
				},
			} );
		} );

		describe( "when data is a plain object", () => {
			beforeEach( () => {
				result = fsmInstance.buildEventPayload(
					fsmInstance,
					{
						fromState: "bakingTheCheesecake",
						action: "startEating",
						toState: "devouringTheCheesecake",
					}
				);
			} );

			it( "should return the expected payload object", () => {
				result.should.eql( {
					namespace: "fsm.test",
					fromState: "bakingTheCheesecake",
					action: "startEating",
					toState: "devouringTheCheesecake",
				} );
			} );
		} );

		describe( "when data is not a plain object", () => {
			beforeEach( () => {
				result = fsmInstance.buildEventPayload(
					"startEating"
				);
			} );

			it( "should return the expected payload object", () => {
				result.should.eql( { data: "startEating", namespace: "fsm.test", } );
			} );
		} );

		describe( "when data is not provided", () => {
			beforeEach( () => {
				result = fsmInstance.buildEventPayload();
			} );

			it( "should return the expected payload object", () => {
				result.should.eql( { data: null, namespace: "fsm.test", } );
			} );
		} );
	} );

	describe( "handle", () => {
		let handleSpy;

		beforeEach( () => {
			handleSpy = sinon.spy( BehavioralFsm.prototype, "handle" );
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				namespace: "fsm.test",
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {
						startEating: "devouringTheCheesecake",
					},
					devouringTheCheesecake: {},
				},
			} );
			fsmInstance.handle( "startEating" );
		} );

		it( "should call ensureClientArg", () => {
			fsmInstance.ensureClientArg.should.be.called();
		} );

		it( "should call through to the BehaviorFsm prototype's handle method", () => {
			handleSpy.should.be.called();
		} );
	} );

	describe( "transition", () => {
		let transitionSpy;

		beforeEach( () => {
			transitionSpy = sinon.spy( BehavioralFsm.prototype, "transition" );
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				namespace: "fsm.test",
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {
						startEating: "devouringTheCheesecake",
					},
					devouringTheCheesecake: {},
				},
			} );
			fsmInstance.transition( "devouringTheCheesecake" );
		} );

		it( "should call ensureClientArg", () => {
			fsmInstance.ensureClientArg.should.be.called();
		} );

		it( "should call through to the BehaviorFsm prototype's transition method", () => {
			transitionSpy.should.be.calledWithExactly( fsmInstance, "devouringTheCheesecake" );
		} );
	} );

	describe( "deferUntilTransition", () => {
		let deferSpy;

		beforeEach( () => {
			deferSpy = sinon.spy( BehavioralFsm.prototype, "deferUntilTransition" );
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				namespace: "fsm.test",
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {
						startEating: "devouringTheCheesecake",
					},
					devouringTheCheesecake: {},
				},
			} );
			fsmInstance.deferUntilTransition( "devouringTheCheesecake" );
		} );

		it( "should call ensureClientArg", () => {
			fsmInstance.ensureClientArg.should.be.called();
		} );

		it( "should call through to the BehaviorFsm prototype's deferUntilTransition method", () => {
			deferSpy.should.be.calledWithExactly( fsmInstance, "devouringTheCheesecake" );
		} );
	} );

	describe( "processQueue", () => {
		let processQueueSpy;

		beforeEach( () => {
			processQueueSpy = sinon.spy( BehavioralFsm.prototype, "processQueue" );
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				namespace: "fsm.test",
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {
						startEating: "devouringTheCheesecake",
					},
					devouringTheCheesecake: {},
				},
			} );
			fsmInstance.processQueue();
		} );

		it( "should call ensureClientArg", () => {
			fsmInstance.ensureClientArg.should.be.called();
		} );

		it( "should call through to the BehaviorFsm prototype's processQueue method", () => {
			processQueueSpy.should.be.calledWithExactly( fsmInstance );
		} );
	} );

	describe( "clearQueue", () => {
		let clearQueueSpy;

		beforeEach( () => {
			clearQueueSpy = sinon.spy( BehavioralFsm.prototype, "clearQueue" );
			fsmInstance = new instance.Fsm( {
				initialize() {
					sandbox.spy( this );
				},
				namespace: "fsm.test",
				initialState: "bakingTheCheesecake",
				states: {
					bakingTheCheesecake: {
						startEating: "devouringTheCheesecake",
					},
					devouringTheCheesecake: {},
				},
			} );
			fsmInstance.clearQueue();
		} );

		it( "should call ensureClientArg", () => {
			fsmInstance.ensureClientArg.should.be.called();
		} );

		it( "should call through to the BehaviorFsm prototype's processQueue method", () => {
			clearQueueSpy.should.be.calledWithExactly( fsmInstance );
		} );
	} );
} );
