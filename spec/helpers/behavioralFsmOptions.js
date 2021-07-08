module.exports = {
	grandparent: {
		states: {
			uninitialized: {
				start: "ready",
				letsDoThis( client ) {
					this.deferUntilTransition( client, "ready" );
				},
			},
			ready: {
				_onEnter() {
					this.emit( "ready-OnEnterFiring" );
				},
				letsDoThis() {
					this.emit( "WeAreDoingThis", { someprop: "someval", } );
				},
				_onExit() {
					this.emit( "ready-OnExitFiring" );
				},
			},
		},
	},
	parent: {
		states: {
			notQuiteDone: {
				doMoar( client ) {
					this.emit( "doingMoar" );
					this.transition( client, "done" );
				},
			},
		},
	},
	child: {
		namespace: "specialSauceNamespace",
		states: {
			ready: {
				letsDoThis( client ) {
					this.emit( "WeAreDoingThis", { someprop: "someval", } );
					this.transition( client, "notQuiteDone" );
				},
				canWeDoThis( client, name ) {
					return `yep, ${ name } can do it.`;
				},
			},
			done: {
				_onEnter() {
					this.emit( "done-OnEnterFiring" );
				},
			},
		},
	},
};
