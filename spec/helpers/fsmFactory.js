const _ = require( "lodash" );

module.exports = function( machina ) {
	const BehavioralFsm = machina.BehavioralFsm;
	const Fsm = machina.Fsm;
	const behavioralFsmOptions = require( "./behavioralFsmOptions.js" );
	const classicFsmOptions = require( "./classicFsmOptions.js" );
	return {
		behavioral: {
			"With No Inheritance": {
				instanceWithDefaults() {
					return new machina.BehavioralFsm( { states: { uninitialized: {}, }, } );
				},
				instanceWithOptions( opt ) {
					return new machina.BehavioralFsm( _.merge( {}, this.options, ( opt || {} ) ) );
				},
				options: _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent, behavioralFsmOptions.child ),
			},
			"With Some Inheritance": {
				instanceWithDefaults() {
					const ParentFsm = BehavioralFsm.extend( { states: { uninitialized: {}, }, } );
					return new ParentFsm();
				},
				instanceWithOptions( opt ) {
					const options = _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent, behavioralFsmOptions.child, ( opt || {} ) );
					const ParentFsm = BehavioralFsm.extend( options );
					return new ParentFsm();
				},
				extendingWithStaticProps() {
					const options = _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent, behavioralFsmOptions.child );
					const ParentFsm = BehavioralFsm.extend( options, { someStaticMethod() {}, } );
					return ParentFsm;
				},
				options: _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent, behavioralFsmOptions.child ),
			},
			"With More Inheritance": {
				instanceWithDefaults() {
					const ParentFsm = BehavioralFsm.extend( { states: { uninitialized: {}, }, } );
					const ChildFsm = ParentFsm.extend( {} );
					return new ChildFsm();
				},
				instanceWithOptions( opt ) {
					const options = _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent );
					const ParentFsm = BehavioralFsm.extend( options );
					const ChildFsm = ParentFsm.extend( _.merge( {}, behavioralFsmOptions.child, ( opt || {} ) ) );
					return new ChildFsm();
				},
				extendingWithStaticProps() {
					const options = _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent );
					const ParentFsm = BehavioralFsm.extend( options, { someStaticMethod() {}, } );
					const ChildFsm = ParentFsm.extend( _.merge( {}, behavioralFsmOptions.child ) );
					return ChildFsm;
				},
				options: _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent, behavioralFsmOptions.child ),
			},
			"With Too Much Inheritance": {
				instanceWithDefaults() {
					const GrandparentFsm = BehavioralFsm.extend( { states: { uninitialized: {}, }, } );
					const ParentFsm = GrandparentFsm.extend( {} );
					const ChildFsm = ParentFsm.extend( {} );
					return new ChildFsm();
				},
				instanceWithOptions( opt ) {
					const GrandparentFsm = BehavioralFsm.extend( behavioralFsmOptions.grandparent );
					const ParentFsm = GrandparentFsm.extend( behavioralFsmOptions.parent );
					const ChildFsm = ParentFsm.extend( _.merge( {}, behavioralFsmOptions.child, ( opt || {} ) ) );
					return new ChildFsm();
				},
				extendingWithStaticProps() {
					const GrandparentFsm = BehavioralFsm.extend( behavioralFsmOptions.grandparent, { someStaticMethod() {}, } );
					const ParentFsm = GrandparentFsm.extend( behavioralFsmOptions.parent );
					const ChildFsm = ParentFsm.extend( _.merge( {}, behavioralFsmOptions.child ) );
					return ChildFsm;
				},
				options: _.merge( {}, behavioralFsmOptions.grandparent, behavioralFsmOptions.parent, behavioralFsmOptions.child ),
			},
		},
		machinaFsm: {
			"With No Inheritance": {
				instanceWithDefaults() {
					return new machina.Fsm( { states: { uninitialized: {}, }, } );
				},
				instanceWithOptions( opt ) {
					return new machina.Fsm( _.merge( {}, this.options, ( opt || {} ) ) );
				},
				options: _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent, classicFsmOptions.child ),
			},
			"With Some Inheritance": {
				instanceWithDefaults() {
					const ParentFsm = Fsm.extend( { states: { uninitialized: {}, }, } );
					return new ParentFsm();
				},
				instanceWithOptions( opt ) {
					const options = _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent, classicFsmOptions.child );
					const ParentFsm = Fsm.extend( _.merge( {}, options, opt ) );
					return new ParentFsm();
				},
				extendingWithStaticProps() {
					const options = _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent, classicFsmOptions.child );
					const ParentFsm = Fsm.extend( options, { someStaticMethod() {}, } );
					return ParentFsm;
				},
				options: _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent, classicFsmOptions.child ),
			},
			"With More Inheritance": {
				instanceWithDefaults() {
					const ParentFsm = Fsm.extend( { states: { uninitialized: {}, }, } );
					const ChildFsm = ParentFsm.extend( {} );
					return new ChildFsm();
				},
				instanceWithOptions( opt ) {
					const options = _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent );
					const ParentFsm = Fsm.extend( options );
					const ChildFsm = ParentFsm.extend( _.merge( {}, classicFsmOptions.child, opt ) );
					return new ChildFsm();
				},
				extendingWithStaticProps() {
					const options = _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent );
					const ParentFsm = Fsm.extend( options, { someStaticMethod() {}, } );
					const ChildFsm = ParentFsm.extend( _.merge( {}, classicFsmOptions.child ) );
					return ChildFsm;
				},
				options: _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent, classicFsmOptions.child ),
			},
			"With Too Much Inheritance": {
				instanceWithDefaults() {
					const GrandparentFsm = Fsm.extend( { states: { uninitialized: {}, }, } );
					const ParentFsm = GrandparentFsm.extend( {} );
					const ChildFsm = ParentFsm.extend( {} );
					return new ChildFsm();
				},
				instanceWithOptions( opt ) {
					const GrandparentFsm = Fsm.extend( classicFsmOptions.grandparent );
					const ParentFsm = GrandparentFsm.extend( classicFsmOptions.parent );
					const ChildFsm = ParentFsm.extend( _.merge( {}, classicFsmOptions.child, opt ) );
					return new ChildFsm();
				},
				extendingWithStaticProps() {
					const GrandparentFsm = Fsm.extend( classicFsmOptions.grandparent, { someStaticMethod() {}, } );
					const ParentFsm = GrandparentFsm.extend( classicFsmOptions.parent );
					const ChildFsm = ParentFsm.extend( _.merge( {}, classicFsmOptions.child ) );
					return ChildFsm;
				},
				options: _.merge( {}, classicFsmOptions.grandparent, classicFsmOptions.parent, classicFsmOptions.child ),
			},
		},
	};
};
