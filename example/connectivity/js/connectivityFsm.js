define([
	'jquery',
    'machina',
    'underscore'
], function($, machina, _) {

	return function(stethoscope) {

		var useStethoscope = function(fsm, steth) {
			_.each(['heartbeat', 'no-heartbeat'], function(eventName){
				steth.on(eventName, function(){
					fsm.handle(eventName);
				});
			});
		};

		var fsm = new machina.Fsm({

			namespace: 'connectivity',

			initialState: "offline",

			states: {
				probing: {
					_onEnter: function() {
						var self = this;
						if(!self.wiredUp) {
							useStethoscope(self, stethoscope);
							self.wiredUp = true;
						}
						stethoscope.checkHeartbeat();
					},
					heartbeat: function() {
						this.transition("online");
					},
					"no-heartbeat": function() {
						this.transition("disconnected");
					},
					"*": function() {
						this.deferUntilTransition();
					},
          "go.offline": function() {
						this.transition("offline");
					}
				},

				online: {
					"window.offline": function() {
						this.transition("probing");
					},
					"appCache.error": function() {
						this.transition("probing");
					},
					"request.timeout": function() {
						this.transition("probing");
					},
					"go.offline": function() {
						this.transition("offline");
					}
				},

				disconnected: {
					"window.online": function() {
						this.transition("probing");
					},
					"appCache.downloading": function() {
						this.transition("probing");
					},
          "go.online": function() {
						this.transition("probing");
					},
          "go.offline": function() {
						this.transition("offline");
					}
				},

				offline: {
					"go.online": function() {
						this.transition("probing");
					}
				}
			}
		});

		$(window).bind("online", function() {
			fsm.handle("window.online");
		});

		$(window).bind("offline", function() {
			fsm.handle("window.offline");
		});

		$(window.applicationCache).bind("error", function() {
			fsm.handle("appCache.error");
		});

		$(window.applicationCache).bind("downloading", function() {
			fsm.handle("appCache.downloading");
		});

		return fsm;
	};
});