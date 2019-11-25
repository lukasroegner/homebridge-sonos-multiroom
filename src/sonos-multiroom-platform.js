
const { DeviceDiscovery } = require('sonos');

const SonosDevice = require('./sonos-device');

/**
 * Initializes a new platform instance for the Sonos multiroom plugin.
 * @param log The logging function.
 * @param config The configuration that is passed to the plugin (from the config.json file).
 * @param api The API instance of homebridge (may be null on older homebridge versions).
 */
function SonosMultiroomPlatform(log, config, api) {
    const platform = this;

    // Saves objects for functions
    platform.Accessory = api.platformAccessory;
    platform.Categories = api.hap.Accessory.Categories;
    platform.Service = api.hap.Service;
    platform.Characteristic = api.hap.Characteristic;
    platform.UUIDGen = api.hap.uuid;
    platform.hap = api.hap;
    platform.pluginName = 'homebridge-sonos-multiroom';
    platform.platformName = 'SonosMultiroomPlatform';

    // Checks whether a configuration is provided, otherwise the plugin should not be initialized
    if (!config) {
        return;
    }

    // Defines the variables that are used throughout the platform
    platform.log = log;
    platform.config = config;
    platform.devices = [];
    platform.accessories = [];

    // Initializes the configuration
    platform.config.devices = platform.config.devices || [];

    // Checks whether the API object is available
    if (!api) {
        platform.log('Homebridge API not available, please update your homebridge version!');
        return;
    }

    // Saves the API object to register new devices later on
    platform.log('Homebridge API available.');
    platform.api = api;

    // Subscribes to the event that is raised when homebridge finished loading cached accessories
    platform.api.on('didFinishLaunching', function () {
        platform.log('Cached accessories loaded.');

        // Discovers the Sonos devices
        DeviceDiscovery(function (device) { 
            platform.log('Found device at ' + device.host + ' with name ' + device.getName() + '.');

            // Gets the corresponding device configuration
            const config = platform.config.devices.find(function(d) { return d.name === device.getName() || d.host === device.host; });
            if (!config) {
                platform.log('No configuration provided for device at ' + device.host + ' with name ' + device.getName() + '.');
                continue;
            }

            // Creates the device instance and adds it to the list of all devices
            platform.devices.push(new SonosDevice(platform, device, config));
        });


        // Removes the accessories that are not bound to a device
        let unusedAccessories = platform.accessories.filter(function(a) { return !platform.devices.some(function(d) { return d.host === a.context.host || d.name === a.context.name; }); });
        for (let i = 0; i < unusedAccessories.length; i++) {
            const unusedAccessory = unusedAccessories[i];
            platform.log('Removing accessory with host ' + unusedAccessory.context.host + ', name ' + unusedAccessory.context.name + ' and kind ' + unusedAccessory.context.kind + '.');
            platform.accessories.splice(platform.accessories.indexOf(unusedAccessory), 1);
        }
        platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, unusedAccessories);
        platform.log('All devices found.');
    });
}

/**
 * Configures a previously cached accessory.
 * @param accessory The cached accessory.
 */
SonosMultiroomPlatform.prototype.configureAccessory = function (accessory) {
    const platform = this;

    // Adds the cached accessory to the list
    platform.accessories.push(accessory);
}

/**
 * Defines the export of the file.
 */
module.exports = SonosMultiroomPlatform;
