var resourceGetter = {
		getNews: function() {
			$.ajax({
				url: "http://api.ihackernews.com/page?format=jsonp",
				dataType: "jsonp",
				success: function( data ) {
					postal.publish("application", "itemData.retrieved", data);
				}
			});
			setTimeout(function(){
				postal.publish("application", "itemData.getFailed", {});
			}, 4000);
		}
	},
	appFsm = new machina.Fsm({
		checkIfReady: function() {
			if(_.all(this.stateBag.constraints[this.state].checkList, function(constraint) { return constraint; })) {
				this.transition(this.stateBag.constraints[this.state].nextState);
			}
		},

		messaging: {
			provider : "postal",
			eventNamespace: "application.events",
			handlerNamespace: "application"
		},

		stateBag : {
			constraints: {
				waitingOnTemplates: {
					nextState: "waitingOnData",
					checkList: {
						haveMainTemplate: false,
						haveItemTemplate: false,
						haveErrorTemplate: false
					}
				},
				waitingOnData: {
					nextState: "ready",
					attempts: 0,
					checkList: {
						haveItemData: false
					}
				}
			}
		},

		states: {
			"uninitialized": {
				initialize : function(){
					this.transition("waitingOnTemplates");
				},
				"*" : function() {
					this.deferUntilTransition();
				}
			},
			waitingOnTemplates : {
				"mainTemplate.retrieved" : function(state) {
					state.constraints.waitingOnTemplates.checkList.haveMainTemplate = true;
					this.checkIfReady();
				},
				"itemTemplate.retrieved" : function(state) {
					state.constraints.waitingOnTemplates.checkList.haveItemTemplate = true;
					this.checkIfReady();
				},
				"errorTemplate.retrieved" : function(state) {
					state.constraints.waitingOnTemplates.checkList.haveErrorTemplate = true;
					this.checkIfReady();
				},
				"*" : function() {
					this.deferUntilTransition();
				}
			},
			waitingOnData: {
				_onEnter: function() {
					resourceGetter.getNews();
				},
				"itemData.retrieved" : function(state) {
					state.constraints.waitingOnData.checkList.haveItemData = true;
					this.checkIfReady();
				},
				"itemData.getFailed" : function(state) {
					this.fireEvent("dataGetFail", { attempts: ++state.constraints.waitingOnData.attempts });
					resourceGetter.getNews();
				}
			},
			"ready" : {
				_onEnter: function() {
					this.fireEvent("appReady");
				}
			}
		}
	}),
	mainView = new MainView( "#content" ),
	itemView = new ItemView( "#items" );

var app = window.loadApp = {
	fsm: appFsm,
	views: {
		main: mainView,
		items: itemView
	},
	start: function() {
		postal.publish("application", "initialize", {});
	}
};

app.start();

