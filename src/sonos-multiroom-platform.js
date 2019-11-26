
const { Listener, AsyncDeviceDiscovery } = require('sonos');

const SonosZone = require('./sonos-zone');

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
    platform.zones = [];
    platform.accessories = [];

    // Initializes the configuration
    platform.config.zones = platform.config.zones || [];
    platform.config.discoveryTimeout = platform.config.discoveryTimeout || 5000;
    platform.config.models = [
        { name: 'ZPS9', displayName: 'Playbar', hasSpeechEnhancement: true, hasNightMode: true },
        { name: 'ZPS11', displayName: 'Playbase', hasSpeechEnhancement: true, hasNightMode: true }
    ];

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

        // Registers the shutdown event
        platform.api.on('shutdown', function () {
            Listener.stopListener().then(function() {}, function() {});
        });
        
        // Discovers the Sonos devices
        discovery = new AsyncDeviceDiscovery();
        discovery.discoverMultiple({ timeout: platform.config.discoveryTimeout }).then(function (discoveredDevices) {
            platform.log('Discovery completed, ' + discoveredDevices.length + ' device(s) found.');

            // Gets the names of the zones
            const promises = [];
            const zoneConfigs = [];
            for (let i = 0; i < discoveredDevices.length; i++) {
                const discoveredDevice = discoveredDevices[i];

                // Gets the zone attributes of the device
                promises.push(discoveredDevice.getZoneAttrs().then(function(zoneAttrs) {
                    zoneConfigs.push({
                        host: discoveredDevice.host,
                        name: zoneAttrs.CurrentZoneName
                    });
                }));
            }

            // Waits for all promises to resolve
            Promise.all(promises).then(function() {

                // Gets the devices per zone
                const zoneNames = [];
                const zoneDictionary = {};
                for (let i = 0; i < zoneConfigs.length; i++) {
                    const zoneConfig = zoneConfigs[i];
                    if (zoneNames.indexOf(zoneConfig.name) === -1) {
                        zoneNames.push(zoneConfig.name);
                        zoneDictionary[zoneConfig.name] = [];
                    }
                    zoneDictionary[zoneConfig.name].push(zoneConfig.host);
                }
                
                // Creates the zone objects
                for (let i = 0; i < zoneNames.length; i++) {
                    const zoneName = zoneNames[i];

                    // Gets the corresponding zone configuration
                    const config = platform.config.zones.find(function(z) { return z.name === zoneName; });
                    if (!config) {
                        platform.log('No configuration provided for zone with name ' + zoneName + '.');
                        continue;
                    }

                    // Creates the zone instance and adds it to the list of all zones
                    platform.log('Create zone with name ' + zoneName + ' and hosts ' + zoneDictionary[zoneName].join(', ') + '.');
                    platform.zones.push(new SonosZone(platform, zoneName, zoneDictionary[zoneName], config));
                }

                // Removes the accessories that are not bound to a zone
                let unusedAccessories = platform.accessories.filter(function(a) { return !platform.zones.some(function(z) { return z.name === a.context.name; }); });
                for (let i = 0; i < unusedAccessories.length; i++) {
                    const unusedAccessory = unusedAccessories[i];
                    platform.log('Removing accessory with name ' + unusedAccessory.context.name + ' and kind ' + unusedAccessory.context.kind + '.');
                    platform.accessories.splice(platform.accessories.indexOf(unusedAccessory), 1);
                }
                platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, unusedAccessories);
                platform.log('Initialization completed.');
            });
        });
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
