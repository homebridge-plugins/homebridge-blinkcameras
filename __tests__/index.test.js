const plugin = require('../src/index');
const Blink = require('node-blink-security');
const AsyncLock = require('async-lock');
jest.mock("node-blink-security");
jest.mock("async-lock");

const faker = require('faker');

console.log(new Blink());

let BlinkCameras;

const mockHomeBridge = () => {
    return {
        version: "1.0",
        hap: {
            Service: {
                AccessoryInformation: 'AccessoryInformation',
                Switch: 'Switch'
            },
            Characteristic: {
                Name: '',
                Manufacturer: '',
                SerialNumber: '',
                On: ''
            },
            uuid: {
                generate: jest.fn((string) => { return string })
            }
        },
        platformAccessory: jest.fn().mockImplementation((network, uuid) => { return mockAccessory(uuid) }),
        registerPlatform: (name, className, platform) => {
            BlinkCameras = platform;
        }
    };
}

const mockLog = jest.fn().mockImplementation(console.log);

const mockConfig = {
    name: 'MyNetwork',
    username: 'foo',
    password: 'bar',
    discovery: false
}

const mockApi = () => {
    return {
        on: jest.fn(() => {}),
        registerPlatformAccessories: jest.fn(() => {}),
        unregisterPlatformAccessories: jest.fn(() => {})
    }
};

const mockCharacteristic = {
    on: jest.fn().mockImplementation((action, callback) => {
        callback(jest.fn(() => {}), action);
        return mockCharacteristic;
    })
};

const mockService = {
    getCharacteristic: jest.fn(() => {
        return mockCharacteristic;
    }),
    setCharacteristic: jest.fn(() => {
        return mockService;
    })
};

const mockAccessory = (uuid = faker.random.uuid()) => {
    return {
        displayName: 'Mock Accessory',
        UUID: uuid,
        context: {},
        getService: jest.fn((arg) => {
            return mockService;
        }),
        addService: jest.fn(() => {
            return mockService;
        })
    };
};

const mockCameraAccessory = (uuid, id, reachable = true) => {
    return {
        ...mockAccessory(uuid),
        context: {
            id,
            isCamera: true
        },
        reachable
    }
};

const mockNetworkAccessory = (uuid, id) => {
    return {
        ...mockAccessory(uuid),
        context: {
            id,
            isNetwork: true
        }
    }
};

const mockBlinkCamera = (id) => {
    return {
        name: `Camera ${id}`,
        id,
        enabled: true,
        setMotionDetect: jest.fn(() => {})
    };
};

const mockBlinkNetwork = (id) => {
    return {
        name: `Network ${id}`,
        id,
        enabled: true,
        setMotionDetect: jest.fn(() => { })
    };
};

let platform;
let bridge;

beforeEach(() => {
    bridge = plugin(mockHomeBridge());
    platform = new BlinkCameras(mockLog, mockConfig, mockApi());
    platform.sleep = jest.fn(() => {});
    platform.lock.acquire = jest.fn(async (id, callback) => {
        await callback('token');
    });
    platform.getBlink();
    platform._blink.cameras = {};
    platform._blink.networks = {};
    platform.accessories = {};
});


describe('getBlink', () => {
    it('should get a new instance of the Blink module', () => {
        const blink = platform.getBlink();
        expect(blink).toBeInstanceOf(Blink);
    });
});

describe('configureAccessory', () => {
    it('should set the accessory to be reachable', () => {
        const uuid = faker.random.uuid();
        const accessory = mockCameraAccessory(uuid, uuid, false);
        platform.configureAccessory(accessory);
        expect(platform.accessories[uuid].reachable).toBe(true);
        expect(platform.accessories[uuid].context.initialized).toBe(true);
    });
});

describe('discover', () => {
    it('should add cameras', async() => {
        platform._blink.cameras = {
            '1': {
                enabled: true
            }
        }
        platform.updateAccessories = jest.fn(() => { });
        platform.addCamera = jest.fn(() => { });
        platform.addNetwork = jest.fn(() => { });
        await platform.discover();
        expect(platform.lock.acquire.mock.calls.length).toBe(1);
        expect(platform._blink.setupSystem.mock.calls.length).toBe(1);
        expect(platform.updateAccessories.mock.calls.length).toBe(1);
        expect(platform.addNetwork.mock.calls.length).toBe(0);
        expect(platform.addCamera.mock.calls.length).toBe(1);
        expect(platform.sleep.mock.calls.length).toBe(1);
    });

    it('should add networks', async() => {
        platform._blink.networks = [{

        }];
        platform.updateAccessories = jest.fn(() => { });
        platform.addNetwork = jest.fn(() => { });
        await platform.discover();
        expect(platform.lock.acquire.mock.calls.length).toBe(1);
        expect(platform.updateAccessories.mock.calls.length).toBe(1);
        expect(platform.addNetwork.mock.calls.length).toBe(1);
        expect(platform._blink.setupSystem.mock.calls.length).toBe(1);
        expect(platform.sleep.mock.calls.length).toBe(1);
    });
});

describe('addCamera', () => {
    it('should add a new Camera', () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        platform.addCamera(uuid, {
            id,
            name: 'MyCamera'
        });
        expect(platform.accessories[uuid].context.isCamera).toBe(true);
        expect(platform.accessories[uuid].context.id).toBe(id);
        expect(bridge.platformAccessory.mock.calls.length).toBe(1);
        expect(platform.api.registerPlatformAccessories.mock.calls.length).toBe(1);
        expect(platform.api.registerPlatformAccessories.mock.calls[0][2]).toStrictEqual([platform.accessories[uuid]]);
    });
});

describe('addNetwork', () => {
    it('should add a new network', () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        platform.addNetwork(uuid, {
            id,
            name: 'MyNetwork'
        });;
        expect(platform.accessories[uuid].context.isNetwork).toBe(true);
        expect(platform.accessories[uuid].context.id).toBe(id);
        expect(bridge.platformAccessory.mock.calls.length).toBe(1);
        expect(platform.api.registerPlatformAccessories.mock.calls.length).toBe(1);
        expect(platform.api.registerPlatformAccessories.mock.calls[0][2]).toStrictEqual([platform.accessories[uuid]]);
    });
});

describe('updateAccessory', () => {
    it('should update the accessory', () => {
        const accessory = mockAccessory();
        platform.updateAccessory(accessory);
        expect(accessory.getService.mock.calls.length).toBe(3);
        expect(mockService.setCharacteristic.mock.calls[0][1]).toBe(accessory.displayName);
        expect(mockService.setCharacteristic.mock.calls[1][1]).toBe('blink');
        expect(mockService.setCharacteristic.mock.calls[2][1]).toBe(accessory.context.id);
        expect(mockService.getCharacteristic.mock.calls.length).toBe(1);
        expect(mockService.setCharacteristic.mock.calls.length).toBe(3);
        expect(accessory.context.initialized).toBe(true);
        expect(mockCharacteristic.on.mock.calls.length).toBe(2);
    });

    it('should add the service when the service does not exist', () => {
        const accessory = mockAccessory();
        accessory.getService = jest.fn().mockImplementation((type) => {
            console.log(`Type = ${type}`);
            if (type === 'AccessoryInformation') {
                return mockService;
            }
            if (type === 'Switch') {
                return false;
            }
        });
        platform.updateAccessory(accessory);
        expect(accessory.getService.mock.calls.length).toBe(2);
        expect(accessory.addService.mock.calls.length).toBe(1);
        expect(mockService.setCharacteristic.mock.calls[0][1]).toBe(accessory.displayName);
        expect(mockService.setCharacteristic.mock.calls[1][1]).toBe('blink');
        expect(mockService.setCharacteristic.mock.calls[2][1]).toBe(accessory.context.id);
        expect(mockService.getCharacteristic.mock.calls.length).toBe(1);
        expect(mockService.setCharacteristic.mock.calls.length).toBe(3);
        expect(accessory.context.initialized).toBe(true);
        expect(mockCharacteristic.on.mock.calls.length).toBe(2);
    })
});

describe('getCameraById', () => {
    it('should return the correct camera', () => {
        const id = faker.random.uuid();
        const id2 = faker.random.uuid();
        const camera1 = mockBlinkCamera(id);
        const camera2 = mockBlinkCamera(id2);
        platform._blink.cameras[id] = camera1;
        platform._blink.cameras[id2] = camera2;
        const found = platform.getCameraById(id);
        expect(found).toBe(camera1);
    });
});

describe('getNetworkById', () => {
    it('should return the correct network', () => {
        const id = faker.random.uuid();
        const id2 = faker.random.uuid();
        const network1 = mockBlinkNetwork(id);
        const network2 = mockBlinkNetwork(id2);
        platform._blink.networks[id] = network1;
        platform._blink.networks[id2] = network2;
        const found = platform.getNetworkById(id);
        expect(found).toBe(network1);
    });
});

describe('getOn', () => {
    it('should call the callback when the accessory is a network', async () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        accessory = mockNetworkAccessory(uuid, id);
        const mockCallback = jest.fn(() => { });
        platform._blink.networks[id] = mockBlinkNetwork(id);
        await platform.getOn(accessory, mockCallback);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls.length).toBe(1);
    });

    it('should call the callback when the accessory is a camera', async () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        const accessory = mockCameraAccessory(uuid, id);
        const mockCallback = jest.fn(() => { });
        platform._blink.cameras[id] = mockBlinkCamera(id);
        await platform.getOn(accessory, mockCallback);
        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls[0][1]).toBe(true);
    });
});


describe('setOn', () => {
    it('should call the callback when the accessory is a network', async () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        const accessory = mockNetworkAccessory(uuid, id);
        platform._blink.networks[id] = mockBlinkNetwork(id);
        const mockCallback = jest.fn(() => { });
        await platform.setOn(accessory, true, mockCallback);
        expect(platform._blink.setArmed.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls.length).toBe(1);
        // expect(platform.sleep.mock.calls.length).toBe(1);
    });

    it('should call the callback when the accessory is camera', async () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        const accessory = mockCameraAccessory(uuid, id);
        const mockCallback = jest.fn(() => { });
        const mockCamera = mockBlinkCamera(id);
        platform._blink.getCameras.mockImplementation(() => {
            return {
                'MyCamera': mockCamera
            };
        });
        platform._blink.cameras[id] = mockCamera;
        await platform.setOn(accessory, 'set', mockCallback);
        expect(platform._blink.getLinks.mock.calls.length).toBe(1);
        expect(mockCamera.setMotionDetect.mock.calls.length).toBe(1);
        expect(mockCamera.setMotionDetect.mock.calls[0][0]).toBe('set');
        expect(mockCallback.mock.calls.length).toBe(1);
        // expect(platform.sleep.mock.calls.length).toBe(1);
    });
});

describe('updateAccessories', () => {
    it('should mark camera as reachable', () => {
        const uuid1 = faker.random.uuid();
        const uuid2 = faker.random.uuid();
        const accessory1 = mockCameraAccessory(uuid1, uuid1, false);
        const accessory2 = mockCameraAccessory(uuid1, uuid1, false);
        const camera1 = mockBlinkCamera(uuid1);
        const camera2 = mockBlinkCamera(uuid2);
        platform.accessories[uuid1] = accessory1;
        platform.accessories[uuid2] = accessory2;
        platform._blink.cameras[uuid1] = camera1;
        platform._blink.cameras[uuid2] = camera1;
        platform.updateAccessory = jest.fn();
        const accessories = platform.updateAccessories(platform.accessories);
        expect(accessories[uuid1].reachable).toBe(true);
    });

    it('should remove cameras which are not in the blink system', () => {
        const uuid1 = faker.random.uuid();
        const accessory1 = mockCameraAccessory(uuid1, uuid1, false);
        const uuid2 = faker.random.uuid();
        const accessory2 = mockCameraAccessory(uuid2, uuid2, false);
        const camera1 = mockBlinkCamera(uuid1);
        const camera2 = mockBlinkCamera(uuid2);
        platform.accessories[uuid1] = accessory1;
        platform.accessories[uuid2] = accessory2;
        platform._blink.cameras[uuid1] = camera1;
        const accessories = platform.updateAccessories(platform.accessories);
        expect(accessories[uuid1]).toBeDefined();
        expect(accessories[uuid2]).toBeUndefined();
        expect(platform.api.unregisterPlatformAccessories.mock.calls.length).toBe(1);
    });
});
