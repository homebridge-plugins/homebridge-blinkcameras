/* jshint node: true */
// Blink Security Platform Plugin for HomeBridge (https://github.com/nfarina/homebridge)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "BlinkSecurityPlatform",
//         "name": "Blink System",
//         "username": "me@example.com",
//         "password": "PASSWORD",
//         "discovery": true    // optional: set to false to disable intermittent discovery and only discovery on boot
//     }
// ]


var Blink = require('node-blink-security');
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    
    homebridge.registerPlatform("homebridge-platform-blink-security", "BlinkSecurityPlatform", BlinkSecurityPlatform, true);
}

function BlinkSecurityPlatform(log, config, api) {
    log("BlinkSecurityPlatform Init");
    var platform = this;
    this.log = log;
    this.config = config;
    this.blink = new Blink(this.config.username, this.config.password);
    this.discoveredCameras = {};
    this.discovery = (this.config.discovery === undefined) ? true : this.config.discovery;
    this.accessories = {};

    if (api) {
        this.api = api;

        this.api.on('didFinishLaunching', function() {
            // initial discovery
            platform.discover();

            // intermittent discovery
            if (platform.discovery === true) {
                setInterval(
                    function() {
                        platform.discover();
                    },
                    30000
                );
            }
        }.bind(this));
    }
}

BlinkSecurityPlatform.prototype.configureAccessory = function(accessory) {
    if (accessory.context.cameraID === 0) {
        accessory.reachable = true;
        this.updateAccessory(accessory);
    } else {
        accessory.reachable = false;
    }
    accessory.context.initialized = false;
    this.accessories[accessory.UUID] = accessory;
    this.log('Loaded cached accessory ' + accessory.UUID);
}

BlinkSecurityPlatform.prototype.addAccessory = function(cameraID) {
    var platform = this;
    var name, uuid, newAccessory;

    uuid = UUIDGen.generate('homebridge-platform-blink-security-' + this.config.name + '-' + cameraID);

    if (this.accessories[uuid] === undefined) {
        if (cameraID === undefined) {
            newAccessory = new Accessory(this.config.name, uuid, 8);
            this.log('Created new accessory ' + newAccessory.UUID);
            newAccessory.context.cameraID = 0;
            this.updateAccessory(newAccessory);
            this.accessories[newAccessory.UUID] = newAccessory;
            this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
        } else {
            for (var name in this.discoveredCameras)  {
                if (this.discoveredCameras.hasOwnProperty(name)) {
                    let camera = this.discoveredCameras[name];
                    if (cameraID === camera.id) {
                        newAccessory = new Accessory(camera.name, uuid, 8);
                        this.log('Created new accessory ' + newAccessory.UUID);
                        newAccessory.context.cameraID = camera.id;
                        this.updateAccessory(newAccessory);
                        this.accessories[newAccessory.UUID] = newAccessory;
                        this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
                    }
                }
            }
        }
    }
}

BlinkSecurityPlatform.prototype.updateAccessory = function(accessory) {
    accessory.context.log = this.log;
    accessory.context.blink = this.blink;

    if (accessory.context.cameraID === 0) {

        
        accessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.config.name)
            .setCharacteristic(Characteristic.Manufacturer, 'blink');
   
        if (accessory.getService(Service.Switch)) {
            accessory.getService(Service.Switch)
                .getCharacteristic(Characteristic.On)
                .on('get', this.getOn.bind(accessory))
                .on('set', this.setOn.bind(accessory));
        } else {
            accessory
                .addService(Service.Switch, accessory.displayName)
                .getCharacteristic(Characteristic.On)
                .on('get', this.getOn.bind(accessory))
                .on('set', this.setOn.bind(accessory));
        }
        this.log("Initialized System Switch");
        accessory.context.initialized = true;
    } else {
        for (var name in this.discoveredCameras)  {
            if (this.discoveredCameras.hasOwnProperty(name)) {
                let camera = this.discoveredCameras[name];
                if (accessory.context.cameraID === camera.id) {
                    accessory
                        .getService(Service.AccessoryInformation)
                        .setCharacteristic(Characteristic.Name, accessory.displayName)
                        .setCharacteristic(Characteristic.Manufacturer, 'blink')
                        .setCharacteristic(Characteristic.SerialNumber, accessory.context.cameraID);
                
                    if (accessory.getService(Service.Switch)) {
                        accessory
                            .getService(Service.Switch)
                            .getCharacteristic(Characteristic.On)
                            .on('get', this.getOn.bind(accessory))
                            .on('set', this.setOn.bind(accessory));
                    } else {
                        accessory
                            .addService(Service.Switch, accessory.displayName)
                            .getCharacteristic(Characteristic.On)
                            .on('get', this.getOn.bind(accessory))
                            .on('set', this.setOn.bind(accessory));
                    }
                    this.log("Initialized Camera Switch: " + camera.id + ' ' + camera.name);
                    accessory.context.initialized = true;
                }
            }
        }
    }
}

BlinkSecurityPlatform.prototype.getOn = function(callback) {
    if (this.context.cameraID === 0) {
        this.context.blink.setupSystem()
            .then(() => {
                this.context.blink.isArmed()
                    .then((response) => {
                        callback(null, response);
                    });
            }, (error) => {
                this.context.log(error);
            });    
    } else {
        this.context.blink.setupSystem()
            .then(() => {
                this.context.blink.getCameras()
                    .then((cameras) => {
                        for (var name in cameras)  {
                            if (cameras.hasOwnProperty(name)) {
                                let camera = cameras[name];
                                if (this.context.cameraID === camera.id) {
                                    callback(null, camera.enabled);
                                }
                            }
                        }
                    });
            }, (error) => {
                this.context.log(error);
            }); 
    }
}

BlinkSecurityPlatform.prototype.setOn = function(action, callback) {
    if (this.context.cameraID === 0) {
        this.context.blink.setupSystem()
            .then(() => {
                this.context.blink.setArmed(action)
                    .then(() => {
                        callback(null, action);
                    });
            }, (error) => {
                this.context.log(error);
            });
    } else {
        this.context.blink.setupSystem()
            .then(() => {
                this.context.blink.getCameras()
                        .then((cameras) => {
                            for (var name in cameras)  {
                                if (cameras.hasOwnProperty(name)) {
                                    let camera = cameras[name];
                                    if (this.context.cameraID === camera.id) {
                                        this.context.blink.getLinks();
                                        camera.setMotionDetect(action)
                                            .then(() => {
                                                callback(null, action);
                                            });
                                    }
                                }
                            }
                        });
            }, (error) => {
                this.context.log(error);
            });
    }
}

BlinkSecurityPlatform.prototype.discover = function() {
    this.blink.setupSystem()
        .then(() => {
            this.blink.getCameras()
                .then((cameras) => {
                    this.discoveredCameras = cameras;

                    // Mark seen cameras as visible
                    for (var cachedAccessory in this.accessories) {
                        if (this.accessories.hasOwnProperty(cachedAccessory)) {
                            let thisCachedAccessory = this.accessories[cachedAccessory];
                            thisCachedAccessory.reachable = (thisCachedAccessory.context.cameraID === 0) ? true : false;
                            for (var testCamera in cameras) {
                                if (cameras.hasOwnProperty(testCamera)) {
                                    let thisTestCamera = cameras[testCamera];
                                    if (thisTestCamera.id === thisCachedAccessory.context.cameraID) {
                                        thisCachedAccessory.reachable = true;
                                        if (thisCachedAccessory.context.initialized === false) {
                                            this.updateAccessory(thisCachedAccessory);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // remove accessories no longer visible
                    var reachableAccessories = {};
                    for (var accessory in this.accessories) {
                        let thisAccessory = this.accessories[accessory];
                        if (thisAccessory.reachable === true) {
                            reachableAccessories[thisAccessory.UUID] = thisAccessory;
                        } else {
                            this.log("Unreachable Camera Switch: " + thisAccessory.context.cameraID + ' ' + thisAccessory.displayName);
                            this.log('Unregister accessory ' + thisAccessory.UUID);
                            this.api.unregisterPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [thisAccessory]);
                        }
                    }
                    this.accessories = reachableAccessories;
                    
                    // add network arm/disarm switch if not yet added
                    this.addAccessory();

                    // add visible cameras if not yet added
                    for (var name in cameras)  {
                        if (cameras.hasOwnProperty(name)) {
                            let camera = cameras[name];
                            this.addAccessory(camera.id);
                        }
                    }

                   
                });
        }, (error) => {
            this.log(error);
        });
}
