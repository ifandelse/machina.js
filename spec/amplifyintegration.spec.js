var testCapture = {
	"machina.test.fsm.event.Transitioned": false,
	"machina.test.fsm.event.Handling": false,
	"machina.test.fsm.event.Handled": false,
	"machina.test.fsm.event.InvalidState": false,
	"machina.test.fsm.event.CustomEvent": false,
	"machina.test.fsm.event.Deferred": false,
	"machina.test.fsm.event.OnEnter": false
};

QUnit.specify("machina.js integration with amplify.js", function(){
	var fsm;
	describe("With custom FSM", function(){
		fsm = new machina.Fsm({
			initialState: "uninitialized",
			messaging: {
				exchange: "machina.test",
				topic: "fsm"
			},
			events: ["CustomEvent", "OnEnter"],
			states: {
				"uninitialized" : {
					"event1" : function() {
						this.transition("initialized");
					},
					"event2" : function() {
						this.deferUntilTransition();
						console.log("HAI!")
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

		amplify.publish("machina.test.fsm.handle.event2", {});
		amplify.publish("machina.test.fsm.handle.event1", {});
		fsm.transition("NoSuchThing");

		it("should fire the Transitioned event", function(){
			assert(testCapture["machina.test.fsm.event.Transitioned"]).equals(true);
		});
		it("should fire the Handling event", function(){
			assert(testCapture["machina.test.fsm.event.Handling"]).equals(true);
		});
		it("should fire the Handled event", function(){
			assert(testCapture["machina.test.fsm.event.Handled"]).equals(true);
		});
		it("should fire the CustomEvent event", function(){
			assert(testCapture["machina.test.fsm.event.CustomEvent"]).equals(true);
		});
		it("should fire the OnEnter handler", function(){
			assert(testCapture["machina.test.fsm.event.OnEnter"]).equals(true);
		});
		it("should fire the InvalidState handler", function(){
			assert(testCapture["machina.test.fsm.event.InvalidState"]).equals(true);
		});
		it("should fire the Deferred handler", function(){
			assert(testCapture["machina.test.fsm.event.Deferred"]).equals(true);
		});
	});
});