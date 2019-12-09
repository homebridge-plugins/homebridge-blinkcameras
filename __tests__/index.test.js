const plugin = require('../src/index');
jest.mock('node-blink-security');
jest.mock('async-lock');
const Blink = require('node-blink-security');
const AsyncLock = require('async-lock');

let BlinkSecurityPlatform;

const mockHomeBridge = {
    version: "1.0",
    hap: {
        Service: {
            AccessoryInformation: '',
            Switch: ''
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
    platformAccessory: jest.fn().mockImplementation(() => { return mockAccessory }),
    registerPlatform: (name, className, platform) => {
        BlinkSecurityPlatform = platform;
    }
}

const mockLog = jest.fn();

const mockConfig = {
    name: 'MyNetwork',
    username: 'foo',
    password: 'bar',
    discovery: false
}

const mockApi = {
    on: jest.fn(() => {}),
    registerPlatformAccessories: jest.fn(() => {})
};

let platform;

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
}

const mockAccessory = {
    displayName: 'Mock Accessory',
    context: {
        id: '1',
        camera: {
            enabled: true
        }
    },
    getService: jest.fn((arg) => {
        return mockService;
    })
};

beforeEach(() => {
    plugin(mockHomeBridge);
    platform = new BlinkSecurityPlatform(mockLog, mockConfig, mockApi);
    platform.sleep = jest.fn(() => {});
    platform.lock.acquire = jest.fn(async (id, callback) => {
        await callback('token');
    });
});


describe('getBlink', () => {
    it('should get a new instance of the Blink module', () => {
        const blink = platform.getBlink();
        expect(blink).toBeInstanceOf(Blink);
    });
});

describe('discover', () => {
    it('should add cameras', async() => {
        platform._blink = undefined;
        platform.getBlink();
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
        platform._blink = undefined;
        platform.getBlink();
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
        platform.addCamera({
            id: '1',
            name: 'MyCamera'
        });
        expect(mockHomeBridge.hap.uuid.generate.mock.calls.length).toBe(1);
        expect(mockAccessory.context.isCamera).toBe(true);
        expect(mockAccessory.context.id).toBe('1');
        expect(mockHomeBridge.hap.uuid.generate.mock.calls[0][0]).toBe(`homebridge-platform-blink-security-${mockConfig.name}-1`);
        expect(mockHomeBridge.platformAccessory.mock.calls.length).toBe(1);
        expect(mockApi.registerPlatformAccessories.mock.calls.length).toBe(1);
        expect(mockApi.registerPlatformAccessories.mock.calls[0][2]).toStrictEqual([mockAccessory]);
    });
});

describe('addNetwork', () => {
    it('should add a new network', () => {
        platform.addNetwork({
            id: '1',
            name: 'MyNetwork'
        });
        expect(mockHomeBridge.hap.uuid.generate.mock.calls.length).toBe(1);
        expect(mockHomeBridge.hap.uuid.generate.mock.calls[0][0]).toBe(`homebridge-platform-blink-security-${mockConfig.name}-1`);
        expect(mockAccessory.context.isCamera).toBe(true);
        expect(mockAccessory.context.id).toBe('1');
        expect(mockHomeBridge.platformAccessory.mock.calls.length).toBe(1);
        expect(mockApi.registerPlatformAccessories.mock.calls.length).toBe(1);
        expect(mockApi.registerPlatformAccessories.mock.calls[0][2]).toStrictEqual([mockAccessory]);
    });
});

describe('configureAccessory', () => {
    it('should set the accessory to be reachable', () => {
        platform.configureAccessory(mockAccessory)
        expect(mockAccessory.reachable).toBe(true);
    });
});

describe('updateAccessory', () => {
    it('should update the accessory', () => {
        platform.updateAccessory(mockAccessory);
        expect(mockAccessory.getService.mock.calls.length).toBe(3);
        expect(mockService.setCharacteristic.mock.calls[0][1]).toBe(mockAccessory.displayName);
        expect(mockService.setCharacteristic.mock.calls[1][1]).toBe('blink');
        expect(mockService.setCharacteristic.mock.calls[2][1]).toBe(mockAccessory.context.id);
        expect(mockService.getCharacteristic.mock.calls.length).toBe(1);
        expect(mockService.setCharacteristic.mock.calls.length).toBe(3);
        expect(mockAccessory.context.initialized).toBe(true);
        expect(mockCharacteristic.on.mock.calls.length).toBe(2);
    });
});

describe('getOn', () => {
    it('should call the callback when the accessory is a network', async () => {
        const mockCallback = jest.fn(() => { });
        mockAccessory.context.isNetwork = true;
        await platform.getOn(mockAccessory, 'get', mockCallback);
        expect(platform._blink.isArmed.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls.length).toBe(1);
    });

    it('should call the callback when the accessory is a camera', async () => {
        platform.getBlink();
        platform._blink.cameras = {
            '1': {
                enabled: true
            }
        };
        const mockCallback = jest.fn(() => { });
        mockAccessory.context.isNetwork = false;
        mockAccessory.context.id = '1';
        await platform.getOn(mockAccessory, 'get', mockCallback);
        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls[0][1]).toBe(true);
    });
});


describe('setOn', () => {
    it('should call the callback when the accessory is a network', async () => {
        mockAccessory.context.isNetwork = true;
        const mockCallback = jest.fn(() => { });
        await platform.setOn(mockAccessory, 'set', mockCallback);
        expect(platform._blink.setArmed.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBe(null);
        expect(mockCallback.mock.calls[0][1]).toBe('set');
        expect(platform.sleep.mock.calls.length).toBe(1);
    });

    it('should call the callback when the accessory is camera', async () => {
        platform.getBlink();
        mockAccessory.context.isNetwork = true;
        const mockCallback = jest.fn(() => { });
        mockAccessory.context.isNetwork = false;
        mockAccessory.context.id = '1';
        const mockCamera = {
            id: '1',
            setMotionDetect: jest.fn(() => { })
        };
        platform._blink.getCameras.mockImplementation(() => {
            return {
                'MyCamera': mockCamera
            };
        });
        await platform.setOn(mockAccessory, 'set', mockCallback);
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
