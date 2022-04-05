let helper = require('node-red-node-test-helper');
let vacuumNode = require('../mqtt-vacuum.js');
let defaultFlow = [
	{
		id: 'n1',
		type: 'mqtt-vacuum',
		name: 'test name',
		storage_folder: './',
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
//helper.init(require.resolve('node-red'));

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
});
