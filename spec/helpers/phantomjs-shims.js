// From https://github.com/newtriks/react-automation-example/blob/master/test/helpers/phantomjs-shims.js

( function() {
	const Ap = Array.prototype;
	const slice = Ap.slice;
	const Fp = Function.prototype;

	if ( !Fp.bind ) {
		// PhantomJS doesn't support Function.prototype.bind natively, so
		// polyfill it whenever this module is required.
		Fp.bind = function( context ) {
			const func = this; // eslint-disable-line consistent-this
			const args = slice.call( arguments, 1 ); // eslint-disable-line prefer-rest-params

			function bound() {
				const invokedAsConstructor = func.prototype && ( this instanceof func ); // eslint-disable-line no-invalid-this
				return func.apply(
					// Ignore the context parameter when invoking the bound function
					// as a constructor. Note that this includes not only constructor
					// invocations using the new keyword but also calls to base class
					// constructors such as BaseClass.call(this, ...) or super(...).
					!invokedAsConstructor && context || this, // eslint-disable-line no-mixed-operators,no-invalid-this
					args.concat( slice.call( arguments ) ) // eslint-disable-line prefer-rest-params
				);
			}

			// The bound function must share the .prototype of the unbound
			// function so that any object created by one constructor will count
			// as an instance of both constructors.
			bound.prototype = func.prototype;

			return bound;
		};
	}
}() );
