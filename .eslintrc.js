module.exports = {
	root: true,
	env: {
		node: true,
		browser: true,
		commonjs: true,
		es6: true,
	},
	extends: [
		"leankit",
		"leankit/es6",
	],
	parserOptions: {
		sourceType: "module",
	},
	rules: {
		strict: [ "error", "global", ],
		"init-declarations": 0,
		"global-require": 0,
		indent: [ "error", "tab", ],
		"valid-jsdoc": "off", // valid-jsdoc is deprecated
		"comma-dangle": [ "error", {
			arrays: "always",
			objects: "always",
		}, ],
	},
	overrides: [
		{
			files: [ "*.spec.js", ],
			rules: {
				"max-nested-callbacks": "off",
				camelcase: "off",
				"no-magic-numbers": "off",
				"no-console": "off",
				"max-lines": "off",
			},
			env: {
				mocha: true,
			},
		},
	],
};
