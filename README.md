# homebridge-platform-blink-security

Homebridge Platform Plugin for Blink Security Cameras, adapted from Homebridge Plugin for Blink Cameras project https://github.com/bartdorsey/homebridge-blinkcameras.

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
