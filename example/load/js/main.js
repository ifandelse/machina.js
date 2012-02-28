var appFsm = new machina.Fsm({
		checkIfReady: function() {
			if(_.all(this.stateBag.constraints, function(constraint) { return constraint; })) {
				this.transition("ready");
			}
		},

		events: [ "appReady" ],

		stateBag : {
			constraints: {
				haveMainTemplate: false,
				haveItemTemplate: false,
				haveItemData: false
			}
		},

		states: {
			"uninitialized": {
				"initialize" : function(){
					this.transition("initializing");
				}
			},
			"initializing" : {
				"mainTemplate.retrieved" : function(state) {
					state.constraints.haveMainTemplate = true;
					this.checkIfReady();
				},

				"itemTemplate.retrieved" : function(state) {
					state.constraints.haveItemTemplate = true;
					this.checkIfReady();
				},

				"itemData.retrieved" : function(state) {
					state.constraints.haveItemData = true;
					this.checkIfReady();
				}
			},
			"ready" : {
				_onEnter: function() {
					this.fireEvent("appReady");
				},

				"*" : function() {

				}
			}
		}
	}),
	mainView = new MainView( "#content" ),
	itemView = new ItemView( "#items" );

var getResources = function(bag, oldState, newState) {
	if(newState === "initializing") {
		infuser.get("main", function() {
			appFsm.handle("mainTemplate.retrieved");
		});

		infuser.get("item", function() {
			appFsm.handle("itemTemplate.retrieved");
		});

		$.ajax({
			url: "http://api.ihackernews.com/page?format=jsonp",
			dataType: "jsonp",
			success: function( data ) {
				itemView.model = data;
			},
			error: function( jqXHR, textStatus, errorThrown ) {
				console.log( "O NOES! " + textStatus + ": " + errorThrown );
			}
		});

		appFsm.off("Transitioned", getResources);
	}
};

appFsm.on("Transitioned", getResources);

appFsm.on("appReady", function() {
	mainView.render();
	itemView.render();
});

var app = window.loadApp = {
	fsm: appFsm,
	views: {
		main: mainView,
		items: itemView
	}
};

