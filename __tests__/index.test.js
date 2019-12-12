const plugin = require('../src/index');
jest.mock('node-blink-security');
jest.mock('async-lock');
const Blink = require('node-blink-security');
const AsyncLock = require('async-lock');
const faker = require('faker');

let BlinkSecurityPlatform;

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
            BlinkSecurityPlatform = platform;
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

let platform;
let bridge;

beforeEach(() => {
    bridge = plugin(mockHomeBridge());
    platform = new BlinkSecurityPlatform(mockLog, mockConfig, mockApi());
    platform.sleep = jest.fn(() => {});
    platform.lock.acquire = jest.fn(async (id, callback) => {
        await callback('token');
    });
    platform.getBlink();
    platform._blink.cameras = {};
    platform.accessories = {};
});


describe('getBlink', () => {
    it('should get a new instance of the Blink module', () => {
        const blink = platform.getBlink();
        expect(blink).toBeInstanceOf(Blink);
    });
});

describe('discover', () => {
    it('should add cameras', async() => {
        platform._blink.cameras = {
            '1': {
                enabled: true
            }
        }
        platform.markSeenCamerasAsVisible = jest.fn(() => { });
        platform.removeCamerasNoLongerVisible = jest.fn(() => { })
        platform.addCamera = jest.fn(() => { });
        platform.addNetwork = jest.fn(() => { });
        await platform.discover();
        expect(platform.lock.acquire.mock.calls.length).toBe(1);
        expect(platform._blink.setupSystem.mock.calls.length).toBe(1);
        expect(platform.markSeenCamerasAsVisible.mock.calls.length).toBe(1);
        expect(platform.removeCamerasNoLongerVisible.mock.calls.length).toBe(1);
        expect(platform.addNetwork.mock.calls.length).toBe(0);
        expect(platform.addCamera.mock.calls.length).toBe(1);
        expect(platform.sleep.mock.calls.length).toBe(1);
    });

    it('should add networks', async() => {
        platform._blink.networks = [{

        }];
        platform.markSeenCamerasAsVisible = jest.fn(() => { });
        platform.removeCamerasNoLongerVisible = jest.fn(() => { })
        platform.addNetwork = jest.fn(() => { });
        await platform.discover();
        expect(platform.lock.acquire.mock.calls.length).toBe(1);
        expect(platform.markSeenCamerasAsVisible.mock.calls.length).toBe(1);
        expect(platform.removeCamerasNoLongerVisible.mock.calls.length).toBe(1);
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
        expect(accessory.getService.mock.calls.length).toBe(2);
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

describe('getOn', () => {
    it('should call the callback when the accessory is a network', async () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        accessory = mockNetworkAccessory(uuid, id);
        const mockCallback = jest.fn(() => { });
        await platform.getOn(accessory, 'get', mockCallback);
        expect(platform._blink.isArmed.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls.length).toBe(1);
    });

    it('should call the callback when the accessory is a camera', async () => {
        const uuid = faker.random.uuid();
        const id = faker.random.uuid();
        const accessory = mockCameraAccessory(uuid, id);
        const mockCallback = jest.fn(() => { });
        platform._blink.cameras[id] = mockBlinkCamera(id);
        await platform.getOn(accessory, 'get', mockCallback);
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
        const mockCallback = jest.fn(() => { });
        await platform.setOn(accessory, 'set', mockCallback);
        expect(platform._blink.setArmed.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls[0][1]).toBe('set');
        expect(platform.sleep.mock.calls.length).toBe(1);
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
        expect(platform._blink.getCameras.mock.calls.length).toBe(1);
        expect(platform._blink.getLinks.mock.calls.length).toBe(1);
        expect(mockCamera.setMotionDetect.mock.calls.length).toBe(1);
        expect(mockCamera.setMotionDetect.mock.calls[0][0]).toBe('set');
        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls[0][1]).toBe('set');
        expect(platform.sleep.mock.calls.length).toBe(1);
    });
});

describe('markSeenCamerasAsVisible', () => {
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
        platform.markSeenCamerasAsVisible();
        expect(platform.accessories[uuid1].reachable).toBe(true);
        expect(platform.updateAccessory.mock.calls.length).toBe(2);
    });
});

describe('removeCamerasNoLongerVisible', () => {
    it('should remove cameras which are not reachable', () => {
        const camera1uuid = faker.random.uuid();
        const camera1 = mockCameraAccessory(camera1uuid, camera1uuid, false);
        const camera2uuid = faker.random.uuid();
        const camera2 = mockCameraAccessory(camera2uuid, camera2uuid, true);
        platform.accessories[camera1uuid] = camera1;
        platform.accessories[camera2uuid] = camera2;
        platform.removeCamerasNoLongerVisible();
        expect(platform.accessories[camera1uuid]).toBeUndefined();
        expect(platform.api.unregisterPlatformAccessories.mock.calls.length).toBe(1);
        expect(platform.accessories[camera2uuid]).toBeDefined();
    });
});