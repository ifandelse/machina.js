module.exports = {
	grandparent: {
		states: {
			uninitialized: {
				start: "ready",
				letsDoThis: function() {
					this.deferUntilTransition( "ready" );
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
				doMoar: function() {
					this.emit( "doingMoar" );
					this.transition( "done" );
				}
			}
		}
	},
	child: {
		namespace: "specialSauceNamespace",
		states: {
			ready: {
				letsDoThis: function() {
					this.emit( "WeAreDoingThis", { someprop: "someval" } );
					this.transition( "notQuiteDone" );
				},
				canWeDoThis: function( name ) {
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
