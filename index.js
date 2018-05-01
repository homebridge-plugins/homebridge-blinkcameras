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
var AsyncLock = require('node-async-locks').AsyncLock;
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
    this.lock = new AsyncLock();
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

BlinkSecurityPlatform.prototype.getBlink = function() {
    if ((this._blinkts === undefined) || ((new Date() - this._blinkts) > 86340000)) {
        this._blinkts = new Date();
        this._blink = new Blink(this.config.username, this.config.password);
        return this._blink;
    } else {
        return this._blink;
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
    accessory.context.getBlink = this.getBlink.bind(this);
    accessory.context.lock = this.lock;

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

BlinkSecurityPlatform.prototype.getOn = async function(callback) {
    var accessory = this;
    var blink = accessory.context.getBlink();
    if (this.context.cameraID === 0) {
        blink.setupSystem()
            .then(() => {
                blink.isArmed()
                    .then((response) => {
                        callback(null, response);
                    })
                    .catch((error) => {
                        accessory.context.log(error);
                    });
            })
            .catch((error) => {
                accessory.context.log(error);
            });
    } else {
        blink.setupSystem()
            .then(() => {
                blink.getCameras()
                    .then((cameras) => {
                        for (var name in cameras)  {
                            if (cameras.hasOwnProperty(name)) {
                                let camera = cameras[name];
                                if (accessory.context.cameraID === camera.id) {
                                    callback(null, camera.enabled);
                                }
                            }
                        }
                    })
                    .catch((error) => {
                        accessory.context.log(error);
                    });
            })
            .catch((error) => {
                accessory.context.log(error);
            });
    }
}

BlinkSecurityPlatform.prototype.setOn = async function(action, callback) {
    var accessory = this;
    var blink = accessory.context.getBlink();
    if (this.context.cameraID === 0) {
        await this.context.lock.enter(function(token) {
            blink.setupSystem()
                .then(() => {
                    blink.setArmed(action)
                        .then(() => {
                            callback(null, action);
                            new Promise(resolve => setTimeout(resolve, 1500))
                                .then(() => {
                                    accessory.context.lock.leave(token);
                                })
                                .catch((error) => {
                                    accessory.context.log(error);
                                    accessory.context.lock.leave(token);
                                });
                        })
                        .catch((error) => {
                            accessory.context.log(error);
                            accessory.context.lock.leave(token);
                        });
                })
                .catch((error) => {
                    accessory.context.log(error);
                    accessory.context.lock.leave(token);
                });
        });
    } else {
        await this.context.lock.enter(function(token) {
            blink.setupSystem()
                .then(() => {
                    blink.getCameras()
                            .then((cameras) => {
                                for (var name in cameras)  {
                                    if (cameras.hasOwnProperty(name)) {
                                        let camera = cameras[name];
                                        if (accessory.context.cameraID === camera.id) {
                                            blink.getLinks();
                                            camera.setMotionDetect(action)
                                                .then(() => {
                                                    callback(null, action);
                                                    new Promise(resolve => setTimeout(resolve, 1500))
                                                        .then(() => {
                                                            accessory.context.lock.leave(token);
                                                        })
                                                        .catch((error) => {
                                                            accessory.context.log(error);
                                                            accessory.context.lock.leave(token);
                                                        });
                                                })
                                                .catch((error) => {
                                                    accessory.context.log(error);
                                                    accessory.context.lock.leave(token);
                                                });
                                        }
                                    }
                                }
                            })
                            .catch((error) => {
                                accessory.context.log(error);
                                accessory.context.lock.leave(token);
                            });
                })
                .catch((error) => {
                    accessory.context.log(error);
                    accessory.context.lock.leave(token);
                });
        });
    }
}

BlinkSecurityPlatform.prototype.discover = async function() {
    var platform = this;
    var blink = platform.getBlink();
    await this.lock.enter(function(token) {
        blink.setupSystem()
            .then(() => {
                blink.getCameras()
                    .then((cameras) => {
                        platform.discoveredCameras = cameras;

                        // Mark seen cameras as visible
                        for (var cachedAccessory in platform.accessories) {
                            if (platform.accessories.hasOwnProperty(cachedAccessory)) {
                                let thisCachedAccessory = platform.accessories[cachedAccessory];
                                thisCachedAccessory.reachable = (thisCachedAccessory.context.cameraID === 0) ? true : false;
                                for (var testCamera in cameras) {
                                    if (cameras.hasOwnProperty(testCamera)) {
                                        let thisTestCamera = cameras[testCamera];
                                        if (thisTestCamera.id === thisCachedAccessory.context.cameraID) {
                                            thisCachedAccessory.reachable = true;
                                            if (thisCachedAccessory.context.initialized === false) {
                                                platform.updateAccessory(thisCachedAccessory);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // remove accessories no longer visible
                        var reachableAccessories = {};
                        for (var accessory in platform.accessories) {
                            let thisAccessory = platform.accessories[accessory];
                            if (thisAccessory.reachable === true) {
                                reachableAccessories[thisAccessory.UUID] = thisAccessory;
                            } else {
                                platform.log("Unreachable Camera Switch: " + thisAccessory.context.cameraID + ' ' + thisAccessory.displayName);
                                platform.log('Unregister accessory ' + thisAccessory.UUID);
                                platform.api.unregisterPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [thisAccessory]);
                            }
                        }
                        platform.accessories = reachableAccessories;
                        
                        // add network arm/disarm switch if not yet added
                        platform.addAccessory();

                        // add visible cameras if not yet added
                        for (var name in cameras)  {
                            if (cameras.hasOwnProperty(name)) {
                                let camera = cameras[name];
                                platform.addAccessory(camera.id);
                            }
                        }
                        new Promise(resolve => setTimeout(resolve, 1500))
                            .then(() => {
                                platform.lock.leave(token);
                            })
                            .catch((error) => {
                                platform.log(error);
                                platform.lock.leave(token);
                            });
                    })
                    .catch((error) => {
                        platform.log(error);
                        platform.lock.leave(token);
                    });
            })
            .catch((error) => {
                platform.log(error);
                platform.lock.leave(token);
            });
    });
}
