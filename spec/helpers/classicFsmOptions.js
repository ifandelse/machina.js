module.exports = {
	grandparent: {
		states: {
			uninitialized: {
				start: "ready",
				letsDoThis() {
					this.deferUntilTransition( "ready" );
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
				doMoar() {
					this.emit( "doingMoar" );
					this.transition( "done" );
				},
			},
		},
	},
	child: {
		namespace: "specialSauceNamespace",
		states: {
			ready: {
				letsDoThis() {
					this.emit( "WeAreDoingThis", { someprop: "someval", } );
					this.transition( "notQuiteDone" );
				},
				canWeDoThis( name ) {
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
