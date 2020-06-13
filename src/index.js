"use strict";

const Blink = require("node-blink-security");
const AsyncLock = require("async-lock");
const moment = require("moment");
const { sleep } = require("./utils");

// Blink Security Platform Plugin for HomeBridge (https://github.com/nfarina/homebridge)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "BlinkCameras",
//         "name": "Blink System",
//         "username": "me@example.com",
//         "password": "PASSWORD",
//         "deviceId": "A made up device Id",
//         "deviceName": "A made up device Name"
//     }
// ]

const platformName = "homebridge-blinkcameras";
const className = "BlinkCameras";

let Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform(platformName, className, BlinkCameras, true);
    return homebridge;
};

class BlinkCameras {
    constructor(log, config, api) {
        log("Init");
        this.log = log;
        this.config = config;
        this._blinkConfig = [
            this.config.username,
            this.config.password,
            this.config.deviceId,
            {
                auth_2FA: false,
                verification_timeout: 6000,
                device_name: this.config.deviceName,
            },
        ];
        this._blink = new Blink(this._blinkConfig);
        this.authenticate();
        this._nextAuthentication = moment();
        this.discovery =
            this.config.discovery === undefined ? true : this.config.discovery;
        this.accessories = {};
        this.lock = new AsyncLock();

        if (api) {
            this.api = api;
            // TODO: This is temporarily disabled until we solve all the authentication issues
            this.api.on("didFinishLaunching", () => {
                this.log("Finished Launching"); // initial discovery

                this.discover(); // intermittent discovery

                // if (this.discovery === true) {
                //     setInterval(() => {
                //         this.discover();
                //     }, 60000);
                // }
            });
        }
    }

    get blink() {
        if (this._blink) {
            return this._blink;
        }
        this._blink = new Blink(this._blinkConfig);
        return this._blink
    }

    configureAccessory(accessory) {
        accessory.reachable = true;
        this.accessories[accessory.UUID] = this.updateAccessory(accessory);
        this.log(`[${accessory.displayName}] Loaded cached accessory`);
    }

    async authenticate() {
        if (moment().isAfter(this._nextAuthentication)) {
            try {
                this._nextAuthentication = moment().add(24, 'hours');
                this.log(
                    `Authenticating with Blink API as ${this.config.username}`
                );
                // @ts-ignore
                await this.blink.setupSystem();
            } catch (e) {
                this.log('Error authenticating with blink API', e);
            }
        }
    }

    addCamera(uuid, camera) {
        if (this.accessories[uuid] === undefined) {
            const newAccessory = new Accessory(
                `${camera.name} Camera`,
                uuid,
                8
            );
            this.log(`[${camera.name}] Added`);
            newAccessory.context.isCamera = true;
            newAccessory.context.id = camera.id;
            this.updateAccessory(newAccessory);
            this.accessories[newAccessory.UUID] = newAccessory;
            this.api.registerPlatformAccessories(platformName, className, [
                newAccessory,
            ]);
        }
    }

    addNetwork(uuid, network) {
        if (this.accessories[uuid] === undefined) {
            const newAccessory = new Accessory(
                `${network.name} System`,
                uuid,
                8
            );
            this.log(`[${network.name}] Added`);
            newAccessory.context.isNetwork = true;
            newAccessory.context.id = network.id;
            this.updateAccessory(newAccessory);
            this.accessories[newAccessory.UUID] = newAccessory;
            this.api.registerPlatformAccessories(platformName, className, [
                newAccessory,
            ]);
        }
    }

    updateAccessory(accessory) {
        if (accessory.initialized) {
            return;
        }
        this.log(`[${accessory.displayName}] Registering`);

        accessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, accessory.displayName)
            .setCharacteristic(Characteristic.Manufacturer, "blink")
            .setCharacteristic(
                Characteristic.SerialNumber,
                accessory.context.id
            );

        const service = accessory.getService(Service.Switch)
            ? accessory.getService(Service.Switch)
            : accessory.addService(Service.Switch);
        service
            .getCharacteristic(Characteristic.On)
            .on("get", (callback) => {
                this.getOn(accessory, callback);
            })
            .on("set", (newValue, callback, context) => {
                this.setOn(accessory, newValue, callback, context);
            });

        this.log(`[${accessory.displayName}] Initialized`);
        accessory.context.initialized = true;
        return accessory;
    }

    getCameraById(camera_id) {
        const found = Object.entries(this.blink.cameras).find(([, camera]) => {
            return camera.id === camera_id;
        });
        if (found) {
            return found[1];
        }
    }

    getNetworkById(network_id) {
        const found = Object.entries(this.blink.networks).find(([, network]) => {
            return network.id === network_id;
        });
        if (found) {
            return found[1];
        }
    }

    async getOn(accessory, callback) {
        await this.authenticate();
        if (accessory.context.isNetwork) {
            let summary;
            try {
                summary = await this.blink.getSummary();
                const network = summary[accessory.context.id];
                if (network) {
                    const armed = network.network.armed;
                    this.log(
                        `[${accessory.displayName}] is ${
                            armed ? "armed" : "disarmed"
                        }`
                    );
                    callback(null, armed);
                }
            } catch (e) {
                this.log("Couldn't retrieve summary status");
                this.log(e);
            }
        } else {
            let cameras;
            try {
                cameras = await this.blink.getCameras();
                const camera = cameras[accessory.context.id];
                if (camera) {
                    this.log(
                        `[${accessory.displayName}] is ${
                            camera.enabled ? "armed" : "disarmed"
                        }`
                    );
                    callback(null, camera.enabled);
                }
            } catch (e) {
                this.log("Couldn't retrieve camera status");
                this.log(e);
            }
        }
    }

    async setOn(accessory, value, callback) {
        await this.authenticate();
        const key = `${accessory.context.id}-set`;
        if (accessory.context.isNetwork) {
            await this.lock.acquire(key, async () => {
                const network = this.getNetworkById(accessory.context.id);
                if (network) {
                    try {
                        await this.blink.setArmed(value, [accessory.context.id]);
                        this.log(
                            `[${accessory.displayName}] ${
                                value ? "arm" : "disarm"
                            }`
                        );
                        await sleep(3000);
                        callback();
                    } catch (error) {
                        this.log(error);
                    }
                }
            });
        } else {
            await this.lock.acquire(key, async () => {
                const camera = this.getCameraById(accessory.context.id);
                if (camera) {
                    try {
                        this.blink.getLinks();
                        await camera.setMotionDetect(value);
                        this.log(
                            `[${accessory.displayName}] ${
                                value ? "arm" : "disarm"
                            }`
                        );
                        await sleep(3000);
                        // This triggers the blink system to refresh it's list of cameras
                        await this.authenticate();
                        await sleep(3000);
                        callback();
                    } catch (error) {
                        this.log(error);
                    }
                }
            });
        }
    }

    updateAccessories(accessories) {
        let newAccessories = {};
        Object.entries(accessories).forEach(([uuid, accessory]) => {
            const camera = this.getCameraById(accessory.context.id);
            const network = this.getNetworkById(accessory.context.id);
            if (camera || network) {
                accessory.reachable = true;
                newAccessories[uuid] = accessory;
            } else {
                this.log(`[${accessory.displayName}] Unregistering`);
                this.api.unregisterPlatformAccessories(
                    platformName,
                    className,
                    [accessory]
                );
            }
        });
        return newAccessories;
    }

    async discover() {
        this.log("Discovering Cameras");
        await this.lock.acquire("platform", async () => {
            this.log("Inside Lock");

            try {
                await this.authenticate();
                this.log("Setup Blink System");

                // Updating cached accessories to set them reachable if they exist,and unregister them if they don't exist.
                this.accessories = this.updateAccessories(this.accessories);

                // Add networks as switches
                if (this.blink.networks && this.blink.networks.length) {
                    this.blink.networks.forEach((network) => {
                        const uuid = UUIDGen.generate(
                            `${platformName}-${this.config.name}-${network.id}`
                        );
                        this.addNetwork(uuid, network);
                    });
                }

                // Add cameras as switches
                if (this.blink.cameras) {
                    Object.entries(this.blink.cameras).forEach(([, camera]) => {
                        const uuid = UUIDGen.generate(
                            `${platformName}-${this.config.name}-${camera.id}`
                        );
                        this.addCamera(uuid, camera);
                    });
                }

                await sleep(1500);
            } catch (error) {
                this.log(error);
            }
        });
    }
}
