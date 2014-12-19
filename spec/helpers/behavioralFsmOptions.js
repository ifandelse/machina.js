module.exports = {
	grandparent: {
		states: {
			uninitialized: {
				start: "ready",
				letsDoThis: function( client ) {
					this.deferUntilTransition( client, "ready" );
				}
			},
			ready: {
				_onEnter: function() {
					this.emit( "ready-OnEnterFiring" );
				},
				letsDoThis: function() {
					this.emit( "WeAreDoingThis", { someprop: "someval" } );
				},
				_onExit: function() {
					this.emit( "ready-OnExitFiring" );
				}
			}
		}
	},
	parent: {
		states: {
			notQuiteDone: {
				doMoar: function( client ) {
					this.emit( "doingMoar" );
					this.transition( client, "done" );
				}
			}
		}
	},
	child: {
		namespace: "specialSauceNamespace",
		states: {
			ready: {
				letsDoThis: function( client ) {
					this.emit( "WeAreDoingThis", { someprop: "someval" } );
					this.transition( client, "notQuiteDone" );
				},
				canWeDoThis: function( client, name ) {
					return "yep, " + name + " can do it.";
				}
			},
			done: {
				_onEnter: function() {
					this.emit( "done-OnEnterFiring" );
				}
			}
		}
	}
};
