/*** Starline Z-Way HA module *******************************************

Version: 1.0.0

******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------


function Starline (id, controller) {
	// Call superconstructor first (AutomationModule)
	Starline.super_.call(this, id, controller);
}

inherits(Starline, AutomationModule);

_module = Starline;

Starline.prototype.init = function (config) {
    Starline.super_.prototype.init.call(this, config);
	
    var self = this;
  	this.getting_devices = null;
	this.vDevs = [];
	this.sendCommandTimer = null;
	
	executeFile(self.moduleBasePath() + "/lib/encryption.js");
	
	this.getAlldevices();	
	this.timer = setInterval(function() {
       self.updateDevice();
    }, 300*1000);	
};

Starline.prototype.stop = function () {
	var self = this;
	this.vDevs.forEach(function(vDev) {
		if (vDev) {
			self.controller.devices.remove(vDev.id);
		}
	});
	this.vDevs = null;
    if (this.timer) {
        clearInterval(self.timer);
    }
    Starline.super_.prototype.stop.call(this);
};

Starline.prototype.sendcomand = function(device_id, starline_command) {
    var self = this;
	http.request({
		url: "https://developer.starline.ru/json/v2/device/"+device_id+"/async",
		method: "POST",
		async: true,
		headers: {
			"Content-Type": "application/json",
			"Cookie": "slnet="+self.config.slnettoken
		},
		data: JSON.stringify({type: starline_command}),
		success: function(response) {
			if (self.sendCommandTimer) {
				clearTimeout(self.sendCommandTimer);
			}
			self.sendCommandTimer = setTimeout(function() {
				self.sendCommandTimer = null;
				self.updateDevice();
			}, 10*1000);
		}
	});
};

Starline.prototype.updateDevice = function(config) {
    var self = this;
	if (!this.config.userid || !this.config.slnettoken) this.slapiAuth();
	else {
		http.request({
			url: "https://developer.starline.ru/json/v2/user/"+self.config.userid+"/user_info",
			method: "POST",
			async: true,
			headers: {
				"Content-Type": "application/json",
				"Cookie": "slnet="+self.config.slnettoken
			},
			success: function(response) {
				data = JSON.parse(response.data);
				var devices = data.devices;
				devices.push(data.shared_devices);
				devices.forEach(function(device) {
					if (!device.device_id) return;
					var deviceId = null;
					if (!!device.ctemp) {
						deviceId = "Starline_" + self.id + "_ctemp_" + device.device_id;
						d = controller.devices.get(deviceId);
						if (!!d && d.get("metrics:level") !== device.ctemp)
							d.set("metrics:level", device.ctemp);
					}
					if (!!device.etemp) {
						deviceId = "Starline_" + self.id + "_etemp_" + device.device_id;
						d = controller.devices.get(deviceId);
						if (!!d && d.get("metrics:level") !== device.etemp)
							d.set("metrics:level", device.etemp);
					}
					deviceId = "Starline_" + self.id + "_engine_" + device.device_id;
					d = controller.devices.get(deviceId);
					var new_val = device.car_state.ign ? "on" : 'off';
					if (!!d && d.get("metrics:level") !== new_val)
						d.set("metrics:level", new_val);
					deviceId = "Starline_" + self.id + "_arm_" +  device.device_id;
					d = controller.devices.get(deviceId);
					var new_val = device.car_state.arm ? "on" : 'off';
					if (!!d && d.get("metrics:level") !== new_val)
						d.set("metrics:level", new_val);
				});
			}
		});	
	}
};

Starline.prototype.creatDevices = function(device) {
	var self = this;
	var langFile = this.loadModuleLang();
	var self = this;
	var slnettoken = this.config.slnettoken;
	var device_id = device.device_id;	
	var device_name = device.alias;
	self.vDevs = [];
	if (!!device.ctemp) {
		self.vDevs.push(self.controller.devices.create({
			deviceId: "Starline_" + self.id + "_ctemp_" + device_id,
			defaults: {
				deviceType: "sensorMultilevel",
				metrics: {
					title: device_name + " " + langFile.device_ctemp,
					level: device.ctemp,
					icon: "temperature",
					probeTitle: "Temperature",
					scaleTitle: "°C"
				}
			},
			overlay: {},
			handler: function(command) {
				if (command == 'update') {
					self.updateDevice();
				}
			}, 
			moduleId: this.id
		}));
	}
	if (!!device.etemp) {
		self.vDevs.push(self.controller.devices.create({
			deviceId: "Starline_" + self.id + "_etemp_" + device_id,
			defaults: {
				deviceType: "sensorMultilevel",
				metrics: {
					title: device_name + " " + langFile.device_etemp,
					level: device.etemp,
					icon: "temperature",
					probeTitle: "Temperature",
					scaleTitle: "°C"
				}
			},
			overlay: {},
			handler: function(command) {
				if (command == 'update') {
					self.updateDevice();
				}
			}, 
			moduleId: this.id
		}));
	}
	http.request({
		url: "https://developer.starline.ru/json/device/"+device_id+"/ctrls_library",
		method: "POST",
		async: true,
		headers: {
			"Content-Type": "application/json",
			"Cookie": "slnet="+slnettoken
		},
		success: function(response) {
			data = JSON.parse(response.data);
			if (!!data.controls.ign) {
				self.vDevs.push(self.controller.devices.create({
					deviceId: "Starline_" + self.id + "_engine_" + device_id,
					defaults: {
						deviceType: "switchBinary",
						metrics: {
							title: device_name + " " + langFile.device_engine,
							level: device.car_state.ign ? "on" : "off",
							icon: "switch"
							
						}
					},
					overlay: {},
					handler: function(command) {
						if (command != 'update') {
							var level = command;
							this.set("metrics:level", level);
							if (level == "on") {
								starline_command = "ign_start";
							}
							else if (level=="off") {
								starline_command = "ign_stop";
							}
							self.sendcomand(device_id, starline_command);
						}
						else
							self.updateDevice();
					},
					moduleId: this.id
				}));
			}
			if (!!data.controls.arm) {
				self.vDevs.push(self.controller.devices.create({
					deviceId: "Starline_" + self.id + "_arm_" + device_id,
					defaults: {
						deviceType: "switchBinary",
						metrics: {
							title: device_name + " " + langFile.device_arm,
							level: device.car_state.arm ? "on" : "off",
							icon: "switch"
						}
					},
					overlay: {},
					handler: function(command) {
						if (command != 'update') {
							var level = command;
							this.set("metrics:level", level);
							if (level == "on") {
								starline_command = "arm_start";
							}
							else if (level=="off") {
								starline_command = "arm_stop";
							}
							self.sendcomand(device_id, starline_command);
						}
						else
							self.updateDevice();
					},
					moduleId: this.id
				}));
			}
		}
	});	
	
};

Starline.prototype.getAlldevices = function(config) {	
    var self = this;
	var user_id = this.config.userid;
	var slnettoken = this.config.slnettoken;
	if (!user_id || !slnettoken) self.slapiAuth();
	else {
		http.request({
			url: "https://developer.starline.ru/json/v2/user/"+user_id+"/user_info",
			method: "POST",
			async: true,
			headers: {
				"Content-Type": "application/json",
				"Cookie": "slnet="+slnettoken
			},
			success: function(response) {
				data = JSON.parse(response.data);
				data.devices.forEach(function(device) {
					self.creatDevices(device);
				});
				data.shared_devices.forEach(function(device) {
					self.creatDevices(device);
				});
				self.getting_devices = true;
			}
		});	
	}
};

Starline.prototype.slapiAuth = function(config) {
    var self = this;
	var slidusertoken = this.config.slidusertoken;
	if (!slidusertoken) {
	   this.getSlidUserToken();
	}
	else {
		var data = {
			slid_token: slidusertoken
		};
		
		http.request({
			url: "https://developer.starline.ru/json/v2/auth.slid",
			method: "POST",
			async: true,
			headers: {
				"Content-Type": "application/json"
			},
			data: JSON.stringify(data),
			success: function(response) {
				var resp_data_json = JSON.parse(response.data);
				if (resp_data_json['code'] == 200){
					var cookie = response.headers['set-cookie'];
					cookie_arr = cookie.split('; ');
					cookie_arr.forEach(function(item, i, arr) {
						item_arr = item.split('=');
						if (item_arr[0]=="slnet"){
							slnet = item_arr[1];
						}
						return slnet;
					});
					var user_id = resp_data_json['user_id'];
					self.config.userid = user_id;
					self.config.slnettoken = slnet;
					if (self.getting_devices)
						self.updateDevice();
					else
						self.getAlldevices();
				}
				else {
					self.getSlidUserToken();
				}
			}
		});
	}
};

Starline.prototype.getSlidUserToken = function(config) {
	var self = this;
	var app_token = this.config.apptoken;
	var login = this.config.login;
	var password = creatSHA1(this.config.pass);
	
	var data = {
		login: login,
		pass: password
	};
	if (!!self.config.smscode)
		data.smsCode = self.config.smscode;
	
	
	if (!!self.config.captchaSid && !!self.config.captchaCode) {
		data.captchaSid = self.config.captchaSid;
		data.captchaCode = self.config.captchaCode;
	}	
	console.log(JSON.stringify(data));
	if (!app_token) {
	   app_token = this.getAppToken();
	}
	else {
		http.request({
			url: "https://id.starline.ru/apiV3/user/login/",
			method: "POST",
			async: true,
			headers: {
				"token": app_token
			},
			json: true,
			data: data,
			success: function(response) {
				if (response.data.state == 1) {
					self.config.slidusertoken = response.data.desc.user_token;
					self.config.smscode = '';
					self.config.captchaCode = '';
					self.slapiAuth();
				}
				if (response.data.state == 2) {
					self.controller.addNotification("notification", "Starline: Need confirmation. Enter SMS code in app", "module", "Starline");
					if (self.timer) clearInterval(self.timer);
				}
				if (response.data.state == 0) {
					var message = response.data.desc.message;
					if(message.indexOf('username') !== -1) {
						self.controller.addNotification("notification", "Starline: Login or password error", "module", "Starline");
					}
					else if(message.indexOf('Unauthorized') !== -1) {
						self.getAppToken();
					}
					else if(message.indexOf('Captcha') !== -1) {
						self.controller.addNotification("notification", "You must enter captcha. captchaSid: "+response.data.desc.captchaSid+" CaptchaCode: "+response.data.desc.captchaImg, "module", "Starline");
						self.config.captchaSid = response.data.desc.captchaSid;
					}
					if (self.timer) clearInterval(self.timer);
				}
			},
			error: function() {
			}
		});
	}
};

Starline.prototype.getAppToken = function(config) {
    var self = this;
	var app_id = this.config.appid;
	var app_secret = this.config.appsecret;
	var app_code = this.config.appcode;
	if (!app_code) {
	   this.getAppCode();
	}
	else {
		http.request({
		url: "https://id.starline.ru/apiV3/application/getToken?appId="+app_id+"&secret="+creatMD5(app_secret+app_code),
			async: true,
			success: function(response) {
				if (response.data.state == 1 && !!response.data.desc.token) {
					self.config.apptoken = response.data.desc.token;
					self.getSlidUserToken();
				}
				else {
					self.getAppCode();
				}
			}
		});		
	}
};

Starline.prototype.getAppCode = function() {
    var self = this;
	http.request({
		url: "https://id.starline.ru/apiV3/application/getCode?appId="+self.config.appid+"&secret="+creatMD5(self.config.appsecret),
		async: true,
		success: function(response) {
			if (response.data.state == 1 && response.data.desc.code) {
				self.config.appcode = response.data.desc.code;
				self.getAppToken();
			}
			else {
				console.log('Starline: App ID or Secret incorrect '+response.data.desc.code);
				self.controller.addNotification("notification", "Starline: App ID or Secret incorrect", "module", "Starline");
				if (self.timer) clearInterval(self.timer);
			}
		},
		error: function() {
			if (self.timer) clearInterval(self.timer);
		}
	});
};