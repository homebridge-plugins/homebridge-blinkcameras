var request = require("request");
var Blink = require("node-blink-security");
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-blinkcameras", "BlinkCameras", BlinkCameras);
}

function BlinkCameras(log, config) {
    this.log = log;
    this.config = config;
    this.name = config["name"];

    this.service = new Service.Switch(this.name);
    this.service
        .getCharacteristic(Characteristic.On)
        .on('get', this.getOn.bind(this))
        .on('set', this.setOn.bind(this));
}

BlinkCameras.prototype.getOn = function(callback) {
    var blink = new Blink(this.config.username, this.config.password);
    blink.setupSystem()
        .then(() => {
            blink.isArmed()
                .then((response) => {
                    callback(null, response);
                });
        }, (error) => {
            this.log(error);
        });    
}

BlinkCameras.prototype.setOn = function(action, callback) {
    var blink = new Blink(this.config.username, this.config.password);
    blink.setupSystem()
        .then(() => {
            blink.setArmed(action)
                .then(() => {
                    callback(null, action);
                });
        }, (error) => {
            this.log(error);
        });
}

BlinkCameras.prototype.getServices = function() {
    return [this.service];
}
