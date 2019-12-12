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
    return homebridge;
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

    addCamera(uuid, camera) {
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

    addNetwork(uuid, network) {
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

    updateAccessory(accessory) {
        this.log(`Updating accessory ${accessory.displayName}`);

        accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Name, accessory.displayName)
        .setCharacteristic(Characteristic.Manufacturer, 'blink')
        .setCharacteristic(Characteristic.SerialNumber, accessory.context.id);

        const service = accessory.getService(Service.Switch) || accessory.addService(Service.Switch);
        service.getCharacteristic(Characteristic.On)
        .on('get', (callback, action) => {
            this.log(`get ${accessory.displayName}`);
            this.getOn(accessory, action, callback);
        })
        .on('set', (callback, action) => {
            this.log(`set ${accessory.displayName}`);
            this.setOn(accessory, action, callback);
        });

        this.log(`Initialized Camera Switch: ${accessory.context.id} ${accessory.displayName}`);
        accessory.context.initialized = true;
    }

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
                if (blink.cameras) {
                    Object.entries(blink.cameras).forEach(([id, camera]) => {
                        if (accessory.context.id === id) {
                            callback(null, camera.enabled);
                        }
                    })
                }
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
                    await blink.getCameras();
                    Object.entries(blink.cameras).forEach(async ([id, camera]) => {
                        if (accessory.context.id === camera.id) {
                            blink.getLinks();
                            await camera.setMotionDetect(action);
                            callback(null, action);
                            await this.sleep(1500);
                        }
                    });
                } catch (error) {
                    this.log(error);
                }
            });
        }
    }

    markSeenCamerasAsVisible() {
        const blink = this.getBlink();
        // Mark seen cameras as visible
        Object.entries(this.accessories).forEach(([uuid, accessory]) => {
            Object.entries(blink.cameras).forEach(([id, camera]) => {
                this.log(`Checking Camera ${id}`);
                if (accessory.context.isCamera) {
                    if (id === accessory.context.id) {
                        this.log(`Setting cached Accessory ${uuid} ${accessory.displayName} as reachable`);
                        this.accessories[id].reachable = true;
                        if (!accessory.context.initialized) {
                            this.log(`Updating cached Accessory ${uuid} ${accessory.displayName}`)
                            this.updateAccessory(accessory);
                        }
                    }
                }
            });
        });
    }

    removeCamerasNoLongerVisible() {
        // remove accessories no longer visible
        let reachableAccessories = {};
        Object.entries(this.accessories).forEach(([uuid, accessory]) => {
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

                this.markSeenCamerasAsVisible(blink.cameras);
                this.removeCamerasNoLongerVisible();

                // Add networks as switches
                if (blink.networks && blink.networks.length) {
                    blink.networks.forEach((network) => {
                        const uuid = UUIDGen.generate(`homebridge-platform-blink-security-${this.config.name}-${network.id}`);
                        this.addNetwork(uuid, network);
                    });
                }

                // Add cameras as switches
                if (blink.cameras) {
                    Object.entries(blink.cameras).forEach(([id, camera]) => {
                        const uuid = UUIDGen.generate(`homebridge-platform-blink-security-${this.config.name}-${camera.id}`);
                        this.addCamera(uuid, camera);
                    })
                }

                await this.sleep(1500);
            } catch (error) {
                this.log(error);
            }
        });
    }

}
