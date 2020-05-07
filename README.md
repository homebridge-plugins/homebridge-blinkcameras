# homebridge-blinkcameras

## NOTE: Starting on May 11th 2020, this plugin will no longer be able to authenticate with the Blink API.  Blink is implementing a new login method with two factor authentication. It is unknown at this time if the node module I use to talk to the Blink API will be able to come up with a work-around or not.  For tracking purposes here's the github issue on node-blink-security about this: https://github.com/madshall/node-blink-security/issues/39

Homebridge Platform Plugin for Blink Security Cameras.

This allows you to arm and disarm your Blink Home Security Cameras using Apple's HomeKit. This is a plugin for the excellent homebridge project https://github.com/nfarina/homebridge.  

This is built on top of node-blink-security https://github.com/madshall/node-blink-security

To configure this set it up as a platform in your homebridge config.json file.

    "platforms" : [
      {
        "platform": "BlinkSecurityPlatform",
        "name": "Blink System",
        "username" : "<your blink email address>",
        "password" : "<your blink password",
        "discovery": true    // optional: set to false to disable intermittent discovery
      }
    ]

The switch to arm/disarm the system will be given the name from the config. Each camera switch will be given the camera name. Multiple systems and cameras with duplicate names cannot be supported until node-blink-security is updated to support it.

The plugin defaults to refreshing every 60 seconds to add or remove cameras from the system, which is useful for troubleshooting. Discovery can be set to false for less overhead, but will require a reload whenever cameras are added or removed from the Blink system.
