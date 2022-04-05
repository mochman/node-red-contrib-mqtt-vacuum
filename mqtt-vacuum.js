const { exit } = require('process');

module.exports = function (RED) {
	const fs = require('fs');

	function oxfordComma(arr) {
		let length = arr.length;
		if (length < 2) return arr[0];
		if (length === 2) return arr.join(' & ');
		arr = arr.slice();
		arr[length - 1] = `& ${arr[length - 1]}`;
		return arr.join(', ');
	}

	function writeToFile(data, location) {
		fs.writeFile(location, data, (err) => {
			if (err) {
				node.status({ fill: 'red', shape: 'ring', text: err });
			}
		});
	}

	function VacuumNode(config) {
		let node = this;
		RED.nodes.createNode(this, config);
		this.fileLocation = config.storage_folder.replace(/\/+$/, '') + '/vacuum.json';
		let startTimes = '{}';
		node.goodFile = false;
		fs.readFile(this.fileLocation, { encoding: 'utf-8' }, function (err, content) {
			if (err) {
				if (err.code === 'ENOENT') {
					node.warn(`could not find file at ${err.path}.  Paths start at ${process.env.PWD}`);
					node.status({ fill: 'red', shape: 'ring', text: `file does not exist` });
				} else {
					node.warn(err);
				}
			} else {
				startTimes = JSON.parse(content) || '{}';
				node.status({});
				node.goodFile = true;
			}
		});

		let neededMsgs = ['charging', 'battery', 'temperature', 'wheel', 'dock', 'status'];
		this.charging = 0;
		this.battery = 0;
		this.temperature = 0;
		this.wheel = 0;
		this.dock = 0;
		this.showStatus = 'Halted';
		this.startTime;
		this.isCleaning = false;
		this.previous;
		this.lastStatus;

		node.on('input', function (msg) {
			this.brushResetTopic = config.brushReset || 'brushReset';
			this.filterResetTopic = config.filterReset || 'filterReset';
			let currentStatus = {
				state: 'docked',
				fan_speed: 'off',
				battery_level: 100,
				cleaning_time: 0,
				cleaned_area: 0,
				batt_temp: 100,
				wheel_status: 'Nothing',
				total_time: 0,
				total_area: 0,
				filter_usage: 0,
				brush_usage: 0,
			};
			let issues = [];
			let isCharging = false;
			let isDocked = false;
			let isError = false;
			let fullBatt = this.battery === 100;
			let goodTopic = false;
			const maxFilterHours = 24;
			const maxBrushHours = 6;

			if (msg.topic != undefined) {
				const topic = /\w+$/.exec(msg.topic)[0].toLowerCase();
				if (neededMsgs.includes(topic)) {
					if (topic === 'status') {
						this['showStatus'] = msg.payload;
						if (msg.payload === 'Cleaning') {
							this.startTime = Date.now();
						}
					} else {
						this[topic] = parseInt(msg.payload);
						if (topic === 'dock') goodTopic = true;
					}
				} else {
					switch (topic) {
						case node.filterResetTopic.toLowerCase():
							startTimes['filter_time'] = 0;
							goodTopic = true;
							const clearFilter = JSON.stringify({
								total_time: startTimes['total_time'],
								filter_time: 0,
								brush_time: startTimes['brush_time'],
							});
							writeToFile(clearFilter, this.fileLocation);
							break;
						case node.brushResetTopic.toLowerCase():
							startTimes['brush_time'] = 0;
							goodTopic = true;
							const clearBrush = JSON.stringify({
								total_time: startTimes['total_time'],
								filter_time: startTimes['filter_time'],
								brush_time: 0,
							});
							writeToFile(clearBrush, this.fileLocation);
							break;
					}
				}
			}

			// status[state] & stats[fan_speed]
			if (this.charging > 0 && this.charging <= 3) isCharging = true;
			if (this.charging === 5) isError = true;
			if (this.dock === 2) isDocked = true;
			if (isDocked) {
				currentStatus.state = 'docked';
				currentStatus.fan_speed = 'off';
				this.isCleaning = false;
			} else {
				currentStatus.fan_speed = 'max';
				switch (this.showStatus) {
					case 'Halted':
						currentStatus.state = 'paused';
						currentStatus.fan_speed = 'off';
						this.isCleaning = false;
						break;
					case 'Cleaning':
						currentStatus.state = 'cleaning';
						this.isCleaning = true;
						break;
					case 'Returning':
						currentStatus.state = 'returning';
						this.isCleaning = true;
						break;
				}
			}

			// status[cleaning_time] & status[cleaned_area]
			if (this.isCleaning) {
				const duration = Date.now() - this.startTime;
				const mins = Math.floor(duration / 1000 / 60);
				currentStatus.cleaning_time = mins;
				currentStatus.cleaned_area = Math.round(mins * 1.19599 * 0.25 * 10) / 10;
			}

			// status[batt_temp]
			currentStatus.batt_temp = Math.round((this.temperature * 9) / 5 + 32);

			// status[battery_level]
			currentStatus.battery_level = this.battery;

			// status[filter_usage / brush_usage / total_time / total_area]
			const totalTime = startTimes['total_time'] / 1000 / 60; // In Minutes
			const filterTime = startTimes['filter_time'] / 1000 / 60 / 60; // In Hours
			const brushTime = startTimes['brush_time'] / 1000 / 60 / 60; // In Hours
			currentStatus.total_time = Math.round(totalTime / 6) / 10;
			currentStatus.total_area = Math.round(totalTime * 2.5 * 1.19599) / 10;
			currentStatus.brush_usage = Math.round(brushTime * 10) / 10;
			currentStatus.filter_usage = Math.round(filterTime * 10) / 10;

			// status[wheel_status]
			if (this.wheel === 2) {
				issues.push('Wheel');
			} else if (this.wheel !== 2) {
				issues = issues.filter((x) => x !== 'Wheel');
			}
			if (filterTime >= maxFilterHours) issues.push('Filter');
			if (brushTime >= maxBrushHours) issues.push('Brush');
			if (issues.length === 0) issues.push('Nothing');
			currentStatus.wheel_status = oxfordComma(issues);

			// write out to file
			if (!this.isCleaning) {
				const duration = Date.now() - this.startTime || 0;
				if (duration > 0 && this.previous) {
					const writeOut = JSON.stringify({
						total_time: startTimes['total_time'] + duration,
						filter_time: startTimes['filter_time'] + duration,
						brush_time: startTimes['brush_time'] + duration,
					});
					startTimes = JSON.parse(writeOut);
					if (node.goodFile) {
						writeToFile(writeOut, this.fileLocation);
					}
				}
			}
			this.previous = this.isCleaning;

			let outMsg = RED.util.cloneMessage(msg);
			outMsg.payload = currentStatus;
			let longStatus = '';
			if (isError) {
				longStatus = 'Error';
				node.status({ fill: 'red', shape: 'ring', text: longStatus });
			} else {
				if (isDocked) {
					longStatus = 'Docked';
					if (isCharging) longStatus += ' - Charging';
					if (fullBatt) longStatus = 'Charged';
				} else {
					if (isCharging) {
						longStatus = 'Charging';
					} else {
						longStatus = this.showStatus;
					}
				}
				node.status({ fill: 'green', shape: 'ring', text: longStatus });
			}
			let longOut = null;
			if (this.lastStatus != longStatus) {
				longOut = { payload: longStatus };
			}
			this.lastStatus = longStatus;
			if (goodTopic) {
				node.send([outMsg, longOut]);
			}
		});
	}
	RED.nodes.registerType('mqtt-vacuum', VacuumNode);
};
