let helper = require('node-red-node-test-helper');
let vacuumNode = require('../mqtt-vacuum.js');
let defaultFlow = [
	{
		id: 'n1',
		type: 'mqtt-vacuum',
		name: 'test name',
		storage_folder: './test/',
		brushReset: 'brushReset',
		filterReset: 'filterReset',
		wires: [['n2'], ['n3']],
	},
	{
		id: 'n2',
		type: 'helper',
	},
	{
		id: 'n3',
		type: 'helper',
	},
];

let output1Tests = [
	['State - Docked', ['state', 'docked'], [{ payload: 2, topic: 'dock' }], 1],
	['State - Paused', ['state', 'paused'], [{ payload: 0, topic: 'dock' }], 1],
	[
		'State - Cleaning',
		['state', 'cleaning'],
		[
			{ payload: 'Cleaning', topic: 'status' },
			{ payload: 0, topic: 'dock' },
		],
		1,
	],
	[
		'State - Returning',
		['state', 'returning'],
		[
			{ payload: 'Cleaning', topic: 'status' },
			{ payload: 0, topic: 'dock' },
			{ payload: 'Returning', topic: 'status' },
			{ payload: 0, topic: 'dock' },
		],
		2,
	],
	[
		'Wheel Status - Stuck',
		['wheel_status', 'Wheel'],
		[
			{ payload: 2, topic: 'wheel' },
			{ payload: 2, topic: 'dock' },
		],
		1,
	],
];

let output2Tests = [
	['Docked', [{ payload: 2, topic: 'dock' }], 1],
	['Halted', [{ payload: 0, topic: 'dock' }], 1],
	[
		'Cleaning',
		[
			{ payload: 'Cleaning', topic: 'status' },
			{ payload: 0, topic: 'dock' },
		],
		1,
	],
	[
		'Returning',
		[
			{ payload: 'Cleaning', topic: 'status' },
			{ payload: 0, topic: 'dock' },
			{ payload: 'Returning', topic: 'status' },
			{ payload: 0, topic: 'dock' },
		],
		2,
	],
	[
		'Docked - Charging',
		[
			{ payload: 1, topic: 'Charging' },
			{ payload: 2, topic: 'dock' },
		],
		1,
	],
	[
		'Charged',
		[
			{ payload: 0, topic: 'Charging' },
			{ payload: 100, topic: 'battery' },
			{ payload: 2, topic: 'dock' },
		],
		1,
	],
];

describe('mqtt-vacuum Node', function () {
	beforeEach(function (done) {
		helper.startServer(done);
	});

	afterEach(function (done) {
		helper.unload();
		helper.stopServer(done);
	});

	it('Can be loaded', function (done) {
		helper.load(vacuumNode, defaultFlow, function () {
			let n1 = helper.getNode('n1');
			try {
				n1.should.have.property('name', 'test name');
				done();
			} catch (err) {
				done(err);
			}
		});
	});

	it("Output on msg.topic - 'dock'", function (done) {
		helper.load(vacuumNode, defaultFlow, function () {
			let n1 = helper.getNode('n1');
			let n2 = helper.getNode('n2');
			n2.on('input', function (msg) {
				try {
					msg.should.have.keys('payload');
					done();
				} catch (err) {
					done(err);
				}
			});
			n1.receive({ payload: 2, topic: 'dock' });
		});
	});

	it("Don't output on other topics", function (done) {
		helper.load(vacuumNode, defaultFlow, function () {
			let n1 = helper.getNode('n1');
			let n2 = helper.getNode('n2');
			n2.on('input', function (msg) {
				try {
					msg.should.have.keys('payload');
					done();
				} catch (err) {
					done(err);
				}
			});
			n1.receive({ payload: 2, topic: 'wheel' });
			setTimeout(function () {
				done();
			}, 300);
		});
	});

	it('Get file contents', function (done) {
		this.timeout(3000);
		let count = 0;
		helper.load(vacuumNode, defaultFlow, function () {
			let n1 = helper.getNode('n1');
			let n2 = helper.getNode('n2');
			n2.on('input', function (msg) {
				count++;
				try {
					if (count === 2) {
						msg.payload.should.have.property('total_time', 442.8);
						setTimeout(function () {
							done();
						}, 700);
					}
				} catch (err) {
					done(err);
				}
			});
			n1.receive({ payload: 2, topic: 'dock' });
			setTimeout(function () {
				n1.receive({ payload: 2, topic: 'dock' });
			}, 500);
		});
	});

	output1Tests.forEach((test) => {
		it(`${test[0]}`, function (done) {
			let count = 0;
			helper.load(vacuumNode, defaultFlow, function () {
				let n1 = helper.getNode('n1');
				let n2 = helper.getNode('n2');
				n2.on('input', function (msg) {
					count++;
					try {
						if (count === test[3]) {
							msg.payload.should.have.property(test[1][0], test[1][1]);
							setTimeout(() => {
								done();
							}, (count - 1) * 10);
						}
					} catch (err) {
						done(err);
					}
				});
				test[2].forEach((cmd, i) => {
					setTimeout(() => {
						n1.receive(cmd);
					}, i * 0);
				});
			});
		});
	});

	output2Tests.forEach((test) => {
		it(`Output 2 - ${test[0]}`, function (done) {
			let count = 0;
			helper.load(vacuumNode, defaultFlow, function () {
				let n1 = helper.getNode('n1');
				let n3 = helper.getNode('n3');
				n3.on('input', function (msg) {
					count++;
					try {
						if (count === test[2]) {
							msg.should.have.property('payload', test[0]);
							setTimeout(() => {
								done();
							}, (count - 1) * 10);
						}
					} catch (err) {
						done(err);
					}
				});
				test[1].forEach((cmd, i) => {
					setTimeout(() => {
						n1.receive(cmd);
					}, i * 0);
				});
			});
		});
	});
});
