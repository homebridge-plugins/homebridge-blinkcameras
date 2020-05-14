'use strict';
class Blink {
    constructor() {
        this.setupSystem = jest.fn();
        this.setArmed = jest.fn();
        this.getCameras = jest.fn();
        this.getLinks = jest.fn();
        this.getSummary = jest.fn();
    }
}

module.exports = Blink;
