'use strict';

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
const Blink = require('node-blink-security');

const AsyncLock = require('async-lock');

let Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform("homebridge-platform-blink-security", "BlinkSecurityPlatform", BlinkSecurityPlatform, true);
};

class BlinkSecurityPlatform {
    constructor(log, config, api) {
        log("Init");
        this.log = log;
        this.config = config;
        this.blink = new Blink(this.config.username, this.config.password);
        this.discovery = this.config.discovery === undefined ? true : this.config.discovery;
        this.accessories = {};
        this.lock = new AsyncLock();

        this.sleep = m => new Promise(r => setTimeout(r, m));

        if (api) {
            this.api = api;
            this.api.on('didFinishLaunching', () => {
                this.log("Finished Launching"); // initial discovery

                this.discover(); // intermittent discovery

                if (this.discovery === true) {
                    setInterval(() => {
                        this.discover();
                    }, 30000);
                }
            });
        }
    }

    getBlink() {
        if (this._blinkts === undefined || new Date() - this._blinkts > 86340000) {
            this._blinkts = new Date();
            this._blink = new Blink(this.config.username, this.config.password);
            return this._blink;
        } else {
            return this._blink;
        }
    }

    configureAccessory(accessory) {
        if (accessory.context.camera || accessory.context.network) {
            accessory.reachable = true;
            this.updateAccessory(accessory);
        } else {
            accessory.reachable = false;
        }

        accessory.context.initialized = false;
        this.accessories[accessory.UUID] = accessory;
        this.log('Loaded cached accessory ' + accessory.UUID);
    }

    addCamera(camera) {
        const uuid = UUIDGen.generate(`homebridge-platform-blink-security-${this.config.name}-${camera.id}`);

        if (this.accessories[uuid] === undefined) {
            const newAccessory = new Accessory(camera.name, uuid, 8);
            this.log('Created new accessory ' + newAccessory.UUID);
            newAccessory.context.isCamera = true;
            newAccessory.context.id = camera.id;
            this.updateAccessory(newAccessory);
            this.accessories[newAccessory.UUID] = newAccessory;
            this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
        }
    }

    addNetwork(network) {
        const uuid = UUIDGen.generate(`homebridge-platform-blink-security-${this.config.name}-${network.id}`);

        if (this.accessories[uuid] === undefined) {
            const newAccessory = new Accessory(network.name, uuid, 8);
            this.log('Created new accessory ' + newAccessory.UUID);
            newAccessory.context.isNetwork = true;
            newAccessory.context.id = network.id;
            this.updateAccessory(newAccessory);
            this.accessories[newAccessory.UUID] = newAccessory;
            this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
        }
    }

    // addAccessory(cameraID) {
    //   var name, uuid, newAccessory;
    //   uuid = UUIDGen.generate('homebridge-platform-blink-security-' + this.config.name + '-' + cameraID);

    //   if (this.accessories[uuid] === undefined) {
    //     if (cameraID === undefined) {
    //       newAccessory = new Accessory(this.config.name, uuid, 8);
    //       this.log('Created new accessory ' + newAccessory.UUID);
    //       newAccessory.context.cameraID = 0;
    //       this.updateAccessory(newAccessory);
    //       this.accessories[newAccessory.UUID] = newAccessory;
    //       this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
    //     } else {
    //       for (var name in this.discoveredCameras) {
    //         if (this.discoveredCameras.hasOwnProperty(name)) {
    //           let camera = this.discoveredCameras[name];

    //           if (cameraID === camera.id) {
    //             newAccessory = new Accessory(camera.name, uuid, 8);
    //             this.log('Created new accessory ' + newAccessory.UUID);
    //             newAccessory.context.cameraID = camera.id;
    //             this.updateAccessory(newAccessory);
    //             this.accessories[newAccessory.UUID] = newAccessory;
    //             this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
    //           }
    //         }
    //       }
    //     }
    //   }
    // }

    updateAccessory(accessory) {
        this.log(`Updating accessory ${accessory.displayName}`);

        accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, accessory.displayName)
            .setCharacteristic(Characteristic.Manufacturer, 'blink')
            .setCharacteristic(Characteristic.SerialNumber, accessory.context.id);

        if (accessory.getService(Service.Switch)) {
            accessory.getService(Service.Switch)
                .getCharacteristic(Characteristic.On)
                .on('get', (callback, action) => {
                    this.log(`get ${accessory.displayName}`);
                    this.getOn(accessory, action, callback);
                })
                .on('set', (callback, action) => {
                    this.log(`set ${accessory.displayName}`);
                    this.setOn(accessory, action, callback);
                });
        } else {
            accessory.addService(Service.Switch, accessory.displayName)
                .getCharacteristic(Characteristic.On)
                .on('get', (callback, action) => {
                    this.log(`get ${accessory.displayName}`);
                    this.getOn(accessory, action, callback)
                })
                .on('set', (callback, action) => {
                    this.log(`set ${accessory.displayName}`);
                    this.setOn(accessory, action, callback)
                });
        }

        this.log(`Initialized Camera Switch: ${accessory.context.id} ${accessory.displayName}`);
        accessory.context.initialized = true;
    }

    // updateAccessory(accessory) {
    //   accessory.context.log = this.log;
    //   accessory.context.getBlink = this.getBlink.bind(this);

    //   if (accessory.context.cameraID === 0) {
    //     accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, this.config.name).setCharacteristic(Characteristic.Manufacturer, 'blink');

    //     if (accessory.getService(Service.Switch)) {
    //       accessory.getService(Service.Switch).getCharacteristic(Characteristic.On).on('get', (action, callback) => this.getOn(accessory, action, callback)).on('set', (action, callback) => this.setOn(accessory, action, callback));
    //     } else {
    //       accessory.addService(Service.Switch, accessory.displayName).getCharacteristic(Characteristic.On).on('get', (action, callback) => this.getOn(accessory, action, callback)).on('set', (action, callback) => this.setOn(accessory, action, callback));
    //     }

    //     this.log("Initialized System Switch");
    //     accessory.context.initialized = true;
    //   } else {

    //     for (var name in this.discoveredCameras) {
    //       if (this.discoveredCameras.hasOwnProperty(name)) {
    //         let camera = this.discoveredCameras[name];

    //         if (accessory.context.cameraID === camera.id) {
    //           accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, accessory.displayName).setCharacteristic(Characteristic.Manufacturer, 'blink').setCharacteristic(Characteristic.SerialNumber, accessory.context.cameraID);

    //           if (accessory.getService(Service.Switch)) {
    //             accessory.getService(Service.Switch).getCharacteristic(Characteristic.On).on('get', (action, callback) => {
    //               this.log(`get ${accessory.displayName}`);
    //               this.getOn(accessory, action, callback);
    //             }).on('set', (action, callback) => {
    //               this.log(`set ${accessory.displayName}`);
    //               this.setOn(accessory, action, callback);
    //             });
    //           } else {
    //             accessory.addService(Service.Switch, accessory.displayName).getCharacteristic(Characteristic.On).on('get', (action, callback) => this.getOn(accessory, action, callback)).on('set', (action, callback) => this.setOn(accessory, action, callback));
    //           }

    //           this.log("Initialized Camera Switch: " + camera.id + ' ' + camera.name);
    //           accessory.context.initialized = true;
    //         }
    //       }
    //     }
    //   }
    // }

    async getOn(accessory, action, callback) {
        const blink = this.getBlink();

        if (accessory.context.isNetwork) {
            try {
                // await blink.setupSystem();
                const response = await blink.isArmed();
                callback(null, response);
            } catch (error) {
                this.log(error);
            }
        } else {
            try {
                Object.entries(blink.cameras).forEach(([id, camera]) => {
                    if (accessory.context.id === id) {
                        callback(null, camera.enabled);
                    }
                })
            } catch (error) {
                this.log(error);
            }
        }
    }

    async setOn(accessory, action, callback) {
        const blink = this.getBlink();

        this.log(`Turning ${action ? "on" : "off"} ${accessory.context.id}`);

        if (accessory.context.isNetwork) {
            await this.lock.acquire(accessory.context.id, async () => {
                try {
                    // await blink.setupSystem();
                    await blink.setArmed(action);
                    callback(null, action);
                    await this.sleep(1500);
                } catch (error) {
                    this.log(error);
                }
            });
        } else {
            await this.lock.acquire(accessory.context.id, async token => {
                try {
                    // await blink.setupSystem();
                    const cameras = await blink.getCameras();

                    for (var name in cameras) {
                        if (cameras.hasOwnProperty(name)) {
                            let camera = cameras[name];

                            if (accessory.context.id === camera.id) {
                                blink.getLinks();
                                await camera.setMotionDetect(action);
                                callback(null, action);
                                await this.sleep(1500);
                            }
                        }
                    }
                } catch (error) {
                    this.log(error);
                }
            });
        }
    }

    markSeenCamerasAsVisible(cameras) {
        // Mark seen cameras as visible
        // this.log(this.accessories);
        Object.entries(this.accessories).forEach(([uuid, accessory]) => {
            Object.entries(cameras).forEach(([id, camera]) => {
                if (accessory.context.isCamera) {
                    if (id === accessory.context.id) {
                        this.log(`Setting cached Accessory ${uuid} ${accessory.displayName} as reachable`);
                        this.accessories[uuid].reachable = true;
                        if (!accessory.context.initialized) {
                            this.log(`Updating cached Accessory ${uuid} ${accessory.displayName}`)
                            this.updateAccessory(accessory);
                        }
                    }
                }
            });
        });
        // for (var cachedAccessory in this.accessories) {
        //     if (this.accessories.hasOwnProperty(cachedAccessory)) {
        //         let thisCachedAccessory = this.accessories[cachedAccessory];
        //         thisCachedAccessory.reachable = thisCachedAccessory.context.camera;

        //         for (let testCamera in cameras) {
        //             if (cameras.hasOwnProperty(testCamera)) {
        //                 let thisTestCamera = cameras[testCamera];

        //                 if (thisTestCamera.id === thisCachedAccessory.context.camera.id) {
        //                     thisCachedAccessory.reachable = true;

        //                     if (thisCachedAccessory.context.initialized === false) {
        //                         this.updateAccessory(thisCachedAccessory);
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // }
    }

    removeCamerasNoLongerVisible() {
        // remove accessories no longer visible
        let reachableAccessories = {};

        Object.entries(this.accessories).forEach(([uuid, accessory]) => {
            this.log(accessory);
            if (accessory.reachable === true) {
                reachableAccessories[uuid] = accessory;
            } else {
                this.log("Unreachable Camera Switch: " + accessory.context.id + ' ' + accessory.displayName);
                this.log('Unregister accessory ' + accessory.UUID);
                this.api.unregisterPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [accessory]);
            }
        });

        this.accessories = reachableAccessories;
    }

    async discover() {
        this.log("Discovering Cameras");
        const blink = this.getBlink();
        await this.lock.acquire('platform', async () => {
            this.log("Inside Lock");

            try {
                await blink.setupSystem();

                // this.discoveredCameras = blink.cameras;

                this.markSeenCamerasAsVisible(blink.cameras);
                this.removeCamerasNoLongerVisible();

                // Add networks as switches
                blink.networks.forEach((network) => {
                    this.addNetwork(network);
                });

                // Add cameras as switches
                Object.entries(blink.cameras).forEach(([id, camera]) => {
                    this.addCamera(camera);
                })

                await this.sleep(1500);
            } catch (error) {
                this.log(error);
            }
        });
    }

}
