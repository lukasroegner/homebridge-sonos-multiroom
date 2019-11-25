
/**
 * Represents a physical Sonos device.
 * @param platform The SonosMultiroomPlatform instance.
 * @param sonos The device that has been discovered by the platform.
 * @param config The device configuration.
 */
function SonosMultiroomDevice(platform, sonos, config) {
    const device = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the sonos device and platform
    device.sonos = sonos;
    device.platform = platform;

    // Sets the host and name
    device.name = sonos.getName();
    device.host = sonos.host;

    platform.log('DEVICE CREATED: ' + device.name + ' ' + device.host);
}

/**
 * Defines the export of the file.
 */
module.exports = SonosMultiroomDevice;
