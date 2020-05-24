# homebridge-blinkcameras

## Note on 2 factor authentication:

Due to two factor authentication being required for Blink login the first time you
run homebridge after installing this plugin it will pause and wait for you to enter
your two factor authentication code. You will receieve two emails from Blink,
one with the code and one to "Allow Device". Make sure you Allow Device before
entering your two factor authentication code.

If you are upgrading from an old version of this plugin you will have to add
a "deviceId" and "deviceName" to your platform config. These can be whatever
you want them to be.

Also the Platform name of this plugin has changed. It is now `BlinkCameras` instead
of `BlinkPlatformSecurity`, so update your config file accordingly.

## Homebridge Platform Plugin for Blink Security Cameras.

This allows you to arm and disarm your Blink Home Security Cameras using Apple's HomeKit. This is a plugin for the excellent homebridge project https://github.com/nfarina/homebridge.

This is built on top of node-blink-security https://github.com/madshall/node-blink-security

To configure this set it up as a platform in your homebridge config.json file.

    "platforms" : [
      {
        "platform": "BlinkCameras",
        "name": "Blink System",
        "username"   : "<your blink email address>",
        "password"   : "<your blink password",
        "deviceId"   : "<a made up device id>",
        "deviceName" : "<a made up device name>"
      }
    ]

The switch to arm/disarm the system will be given the name from the config. Each camera switch will be given the camera name. Multiple systems and cameras with duplicate names cannot be supported until node-blink-security is updated to support it.
