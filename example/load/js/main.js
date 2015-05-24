/*machina.bus.config = {
 handlerChannelSuffix: "",
 eventChannelSuffix: ""
 };*/

var resourceGetter = {
		getNews: function() {
			$.ajax( {
				url: "http://api.ihackernews.com/page?format=jsonp",
				dataType: "jsonp",
				success: function( data ) {
					postal.publish( { channel: "application", topic: "itemData.retrieved", data: data } );
				}
			} );
			return setTimeout( function() {
				postal.publish( { channel: "application", topic: "itemData.getFailed", data: {} } );
			}, 4000 );
		}
	},
	appFsm = new machina.Fsm( {
		checkIfReady: function() {
			if ( _.all( this.constraints[this.state].checkList, function( constraint ) {
				return constraint;
			} ) ) {
				this.transition( this.constraints[this.state].nextState );
			}
		},

		namespace: "application",

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
		},

		states: {
			uninitialized: {
				initialize: "waitingOnTemplates",
				"*": function() {
					this.deferUntilTransition();
				}
			},
			waitingOnTemplates: {
				"mainTemplate.retrieved": function() {
					this.constraints.waitingOnTemplates.checkList.haveMainTemplate = true;
					this.checkIfReady();
				},
				"itemTemplate.retrieved": function() {
					this.constraints.waitingOnTemplates.checkList.haveItemTemplate = true;
					this.checkIfReady();
				},
				"errorTemplate.retrieved": function() {
					this.constraints.waitingOnTemplates.checkList.haveErrorTemplate = true;
					this.checkIfReady();
				},
				"*": function() {
					this.deferUntilTransition();
				}
			},
			waitingOnData: {
				_onEnter: function() {
					this.constraints.waitingOnData.timeoutFn = resourceGetter.getNews();
				},
				"itemData.retrieved": function() {
					clearTimeout( this.constraints.waitingOnData.timeoutFn );
					this.constraints.waitingOnData.checkList.haveItemData = true;
					this.checkIfReady();
				},
				"itemData.getFailed": function() {
					this.emit( "dataGetFail", { attempts: ++this.constraints.waitingOnData.attempts } );
					resourceGetter.getNews();
				}
			},
			"ready": {
				_onEnter: function() {
					this.emit( "appReady" );
				},
				refresh: "waitingOnData"
			}
		}
	} ),
	mainView = new MainView( "#content" ),
	itemView = new ItemView( "#items" );

var app = window.loadApp = {
	fsm: appFsm,
	views: {
		main: mainView,
		items: itemView
	},
	start: function() {
		postal.publish( { channel: "application", topic: "initialize", data: {} } );
	}
};

app.start();
