var testCapture = {
	"myFsm.events.Transitioned": false,
	"myFsm.events.Handling": false,
	"myFsm.events.Handled": false,
	"myFsm.events.InvalidState": false,
	"myFsm.events.CustomEvent": false,
	"myFsm.events.Deferred": false,
	"myFsm.events.OnEnter": false
};

QUnit.specify("machina.js integration with amplify.js", function(){
	var fsm;
	describe("With custom FSM", function(){
		fsm = new machina.Fsm({
			initialState: "uninitialized",
			messaging: {
				eventNamespace: "myFsm.events",
				handlerNamespace: "myFsm.handle"
			},
			events: ["CustomEvent", "OnEnter"],
			states: {
				"uninitialized" : {
					"event1" : function() {
						this.transition("initialized");
					},
					"event2" : function() {
						this.deferUntilTransition();
					}
				},
				"initialized" : {
					_onEnter: function() {
						this.fireEvent("OnEnter");
					},
					"event2" : function() {
						this.fireEvent("CustomEvent");
					},
					"event3" : function() {

					}
				}
			}
		});

		_.each(testCapture, function(val, key) {
			amplify.subscribe(key, function(data) {
				testCapture[key] = true;
			});
		});

		amplify.publish("myFsm.handle.event2", {});
		amplify.publish("myFsm.handle.event1", {});
		fsm.transition("NoSuchThing");

		it("should fire the Transitioned event", function(){
			assert(testCapture["myFsm.events.Transitioned"]).equals(true);
		});
		it("should fire the Handling event", function(){
			assert(testCapture["myFsm.events.Handling"]).equals(true);
		});
		it("should fire the Handled event", function(){
			assert(testCapture["myFsm.events.Handled"]).equals(true);
		});
		it("should fire the CustomEvent event", function(){
			assert(testCapture["myFsm.events.CustomEvent"]).equals(true);
		});
		it("should fire the OnEnter handler", function(){
			assert(testCapture["myFsm.events.OnEnter"]).equals(true);
		});
		it("should fire the InvalidState handler", function(){
			assert(testCapture["myFsm.events.InvalidState"]).equals(true);
		});
		it("should fire the Deferred handler", function(){
			assert(testCapture["myFsm.events.Deferred"]).equals(true);
		});
	});
});