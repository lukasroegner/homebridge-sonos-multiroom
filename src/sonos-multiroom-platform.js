
const { Listener, DeviceDiscovery } = require('sonos');

const SonosZone = require('./sonos-zone');
const SonosApi = require('./sonos-api');

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
    platform.accessories = [];
    platform.devices = [];
    platform.zones = [];

    // Initializes the configuration
    platform.config.zones = platform.config.zones || [];
    platform.config.discoveryTimeout = platform.config.discoveryTimeout || 5000;
    platform.config.isApiEnabled = platform.config.isApiEnabled || false;
    platform.config.apiPort = platform.config.apiPort || 40809;
    platform.config.apiToken = platform.config.apiToken || null;

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
        const discovery = DeviceDiscovery({ timeout: platform.config.discoveryTimeout });
        discovery.on('DeviceAvailable', function (sonos) {
            platform.log('Device discovered: ' + sonos.host);
            platform.devices.push({
                sonos: sonos
            });
        })
        discovery.once('timeout', function () {
            platform.log('Discovery completed, ' + platform.devices.length + ' device(s) found.');

            // Gets the device information
            let promises = [];
            for (let i = 0; i < platform.devices.length; i++) {
                const device = platform.devices[i];

                // Gets the zone attributes of the device
                promises.push(device.sonos.getZoneAttrs().then(function(zoneAttrs) {
                    device.zoneName = zoneAttrs.CurrentZoneName;
                }, function() {
                    platform.log('Error while getting zone attributes of ' + device.sonos.host + '.');
                }));

                // Gets the zone group attributes of the zone
                promises.push(device.sonos.zoneGroupTopologyService().GetZoneGroupAttributes().then(function(zoneGroupAttrs) {
                    device.isZoneMaster = zoneGroupAttrs.CurrentZoneGroupID !== '';
                }, function() {
                    platform.log('Error while getting zone group attributes of ' + device.sonos.host + '.');
                }));

                // Gets the device description
                promises.push(device.sonos.deviceDescription().then(function(deviceDescription) {
                    device.manufacturer = deviceDescription.manufacturer;
                    device.modelNumber = deviceDescription.modelNumber;
                    device.modelName = deviceDescription.modelName;
                    device.serialNumber = deviceDescription.serialNum;
                    device.softwareVersion = deviceDescription.softwareVersion;
                    device.hardwareVersion = deviceDescription.hardwareVersion;

                    // Gets the possible inputs
                    for (let j = 0; j < deviceDescription.serviceList.service.length; j++) {
                        const service = deviceDescription.serviceList.service[j];
                        if (service.serviceId.split(':')[3] === 'AudioIn') {
                            device.audioIn = true;
                        }
                        if (service.serviceId.split(':')[3] === 'HTControl') {
                            device.htControl = true;
                        }
                    }
                }, function() {
                    platform.log('Error while getting device description of ' + device.sonos.host + '.');
                }));
            }

            // Creates the zone objects
            Promise.all(promises).then(function() {
                const zoneMasterDevices = platform.devices.filter(function(d) { return d.isZoneMaster; });
                for (let i = 0; i < zoneMasterDevices.length; i++) {
                    const zoneMasterDevice = zoneMasterDevices[i];

                    // Gets the corresponding zone configuration
                    const config = platform.config.zones.find(function(z) { return z.name === zoneMasterDevice.zoneName; });
                    if (!config) {
                        platform.log('No configuration provided for zone with name ' + info.zoneName + '.');
                        continue;
                    }

                    // Creates the zone instance and adds it to the list of all zones
                    platform.log('Create zone with name ' + zoneMasterDevice.zoneName + '.');
                    platform.zones.push(new SonosZone(platform, zoneMasterDevice, config));
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
            }, function() {
                platform.log('Error while initializing plugin.');
            });
        });

        // Starts the API if requested
        if (platform.config.isApiEnabled) {
            platform.sonosApi = new SonosApi(platform);
        }
    });
}

/**
 * Gets the play state of the group of the specified device.
 * @param device The device.
 * @returns Returns a promise with the play state of the group of the device.
 */
SonosMultiroomPlatform.prototype.getGroupPlayState = function (device) {
    const platform = this;

    // Gets the coordinator based on all groups
    return device.sonos.getAllGroups().then(function(groups) {
        const group = groups.find(function(g) { return g.ZoneGroupMember.some(function(m) { return m.ZoneName === device.zoneName; }); });
        const coordinatorDevice = platform.devices.find(function(d) { return d.sonos.host === group.host; });
        return coordinatorDevice.sonos.getCurrentState().then(function(playState) {
            return playState;
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
