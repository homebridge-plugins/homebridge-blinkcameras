# homebridge-blinkcameras
Homebridge Plugin for Blink Cameras

This allows you to arm and disarm your Blink Home Security Cameras using Apple's HomeKit. This is a plugin for the excellent homebridge project https://github.com/nfarina/homebridge.  

This is built on top of node-blink-security https://github.com/madshall/node-blink-security

To configure this set it up as an accessory in your homebridge config.json file.

    "accessories" : [
      {
        "accessory": "BlinkCameras",
        "name": "My Cameras",
        "username" : "<your blink email address>",
        "password" : "<your blink password"
      }
    ]

At some point I would like to figure out how to use the API to make this show up also as a HomeKit Camera. For now though it just arms/disarms the camera by pretending to be a HomeKit Switch.

