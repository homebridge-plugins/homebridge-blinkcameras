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
          }, 60000);
        }
      });
    }
  }

  configureAccessory(accessory) {
    accessory.reachable = true;
    this.accessories[accessory.UUID] = this.updateAccessory(accessory);
    this.log(`[${accessory.displayName}] Loaded cached accessory`);
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
      const newAccessory = new Accessory(`${camera.name} Camera`, uuid, 8);
      this.log(`[${camera.name}] Added`);
      newAccessory.context.isCamera = true;
      newAccessory.context.id = camera.id;
      this.updateAccessory(newAccessory);
      this.accessories[newAccessory.UUID] = newAccessory;
      this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
    }
  }

  addNetwork(uuid, network) {
    if (this.accessories[uuid] === undefined) {
      const newAccessory = new Accessory(`${network.name} System`, uuid, 8);
      this.log(`[${network.name}] Added`);
      newAccessory.context.isNetwork = true;
      newAccessory.context.id = network.id;
      this.updateAccessory(newAccessory);
      this.accessories[newAccessory.UUID] = newAccessory;
      this.api.registerPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [newAccessory]);
    }
  }

  updateAccessory(accessory) {
    if (accessory.initialized) {
      return;
    }

    this.log(`[${accessory.displayName}] Registering`);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, accessory.displayName).setCharacteristic(Characteristic.Manufacturer, 'blink').setCharacteristic(Characteristic.SerialNumber, accessory.context.id);
    const service = accessory.getService(Service.Switch) ? accessory.getService(Service.Switch) : accessory.addService(Service.Switch);
    service.getCharacteristic(Characteristic.On).on('get', callback => {
      this.getOn(accessory, callback);
    }).on('set', (newValue, callback, context) => {
      this.setOn(accessory, newValue, callback, context);
    });
    this.log(`[${accessory.displayName}] Initialized`);
    accessory.context.initialized = true;
    return accessory;
  }

  getCameraById(camera_id) {
    const blink = this.getBlink();
    const found = Object.entries(blink.cameras).find(([id, camera]) => {
      return camera.id === camera_id;
    });

    if (found) {
      return found[1];
    }
  }

  getNetworkById(network_id) {
    const blink = this.getBlink();
    const found = Object.entries(blink.networks).find(([id, network]) => {
      return network.id === network_id;
    });

    if (found) {
      return found[1];
    }
  }

  getOn(accessory, callback) {
    const blink = this.getBlink();

    if (accessory.context.isNetwork) {
      const network = this.getNetworkById(accessory.context.id);

      if (network) {
        this.log(`[${accessory.displayName}] is ${network.armed ? 'armed' : 'disarmed'}`);
        callback(null, network.armed);
      }
    } else {
      const camera = this.getCameraById(accessory.context.id);

      if (camera) {
        this.log(`[${accessory.displayName}] is ${camera.enabled ? 'armed' : 'disarmed'}`);
        callback(null, camera.enabled);
      }
    }
  }

  async setOn(accessory, value, callback) {
    const blink = this.getBlink();
    const key = `${accessory.context.id}-set`;

    if (accessory.context.isNetwork) {
      await this.lock.acquire(key, async () => {
        const network = this.getNetworkById(accessory.context.id);

        if (network) {
          try {
            await blink.setArmed(value, [accessory.context.id]);
            this.log(`[${accessory.displayName}] ${value ? "arm" : "disarm"}`);
            await this.sleep(3000);
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
            blink.getLinks();
            await camera.setMotionDetect(value);
            this.log(`[${accessory.displayName}] ${value ? "arm" : "disarm"}`);
            await this.sleep(3000);
            callback();
          } catch (error) {
            this.log(error);
          }
        }
      });
    }
  }

  markSeenCamerasAsVisible() {
    const blink = this.getBlink(); // Mark seen cameras as visible

    Object.entries(this.accessories).forEach(([uuid, accessory]) => {
      const camera = this.getCameraById(accessory.context.id);
      const network = this.getNetworkById(accessory.context.id);

      if (camera || network) {
        this.log(`[${accessory.displayName}] Reachable`);
        this.accessories[uuid].reachable = true;
        this.updateAccessory(accessory);
      }
    });
  }

  removeCamerasNoLongerVisible() {
    // remove accessories no longer visible
    let reachableAccessories = {};
    Object.entries(this.accessories).forEach(([uuid, accessory]) => {
      if (accessory.reachable === true) {
        reachableAccessories[uuid] = accessory;
      } else {
        this.log(`[${accessory.displayName}] Unreachable`);
        this.api.unregisterPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [accessory]);
      }
    });
    this.accessories = reachableAccessories;
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
        this.api.unregisterPlatformAccessories("homebridge-platform-blink-security", "BlinkSecurityPlatform", [accessory]);
      }
    });
    return newAccessories;
  }

  async discover() {
    this.log("Discovering Cameras");
    const blink = this.getBlink();
    await this.lock.acquire('platform', async () => {
      this.log("Inside Lock");

      try {
        await blink.setupSystem();
        this.log("Setup Blink System"); // Updating cached accessories to set them reachable if they exist,and unregister them if they don't exist.

        this.accessories = this.updateAccessories(this.accessories); // Add networks as switches

        if (blink.networks && blink.networks.length) {
          blink.networks.forEach(network => {
            const uuid = UUIDGen.generate(`homebridge-platform-blink-security-${this.config.name}-${network.id}`);
            this.addNetwork(uuid, network);
          });
        } // Add cameras as switches


        if (blink.cameras) {
          Object.entries(blink.cameras).forEach(([id, camera]) => {
            const uuid = UUIDGen.generate(`homebridge-platform-blink-security-${this.config.name}-${camera.id}`);
            this.addCamera(uuid, camera);
          });
        }

        await this.sleep(1500);
      } catch (error) {
        this.log(error);
      }
    });
  }

}
