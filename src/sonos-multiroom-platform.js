
const { Listener, DeviceDiscovery } = require('sonos');

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
        const hosts = [];
        const hostsDictionary = {};
        discovery.on('DeviceAvailable', (sonos, modelNumber) => {
            hosts.push(sonos.host);
            hostsDictionary[sonos.host] = {
                sonos: sonos,
                modelNumber: modelNumber
            };
        })
        discovery.once('timeout', function () {
            platform.log('Discovery completed, ' + hosts.length + ' device(s) found.');

            // Gets the master hosts
            let promises = [];
            const masterHosts = [];
            for (let i = 0; i < hosts.length; i++) {
                const host = hosts[i];
                const info = hostsDictionary[host];

                // Gets the zone group attributes of the zone
                promises.push(info.sonos.zoneGroupTopologyService().GetZoneGroupAttributes().then(function(zoneGroupAttrs) {
                    if (zoneGroupAttrs.CurrentZoneGroupID !== '') {
                        masterHosts.push(host);
                    }
                }, function() {
                    platform.log('Error while getting zone group attributes of ' + host + '.');
                }));
            }

            // Gets the master hosts information
            Promise.all(promises).then(function() {
                promises = [];
                for (let i = 0; i < masterHosts.length; i++) {
                    const host = masterHosts[i];
                    const info = hostsDictionary[host];

                    // Gets the zone attributes of the device
                    promises.push(info.sonos.getZoneAttrs().then(function(zoneAttrs) {
                        hostsDictionary[host].zoneName = zoneAttrs.CurrentZoneName;
                    }, function() {
                        platform.log('Error while getting zone attributes of ' + host + '.');
                    }));

                    // Gets the device description
                    promises.push(info.sonos.deviceDescription().then(function(deviceDescription) {
                        platform.log(deviceDescription);
                        hostsDictionary[host].manufacturer = deviceDescription.device.manufacturer;
                        hostsDictionary[host].modelNumber = deviceDescription.device.modelNumber;
                        hostsDictionary[host].modelName = deviceDescription.device.modelName;
                        hostsDictionary[host].serialNumber = deviceDescription.device.serialNum;
                        hostsDictionary[host].serialNumber = deviceDescription.device.serialNum;
                        hostsDictionary[host].softwareVersion = deviceDescription.device.softwareVersion;
                        hostsDictionary[host].hardwareVersion = deviceDescription.device.hardwareVersion;

                        // Gets the possible inputs
                        for (let j = 0; j < deviceDescription.device.serviceList.length; j++) {
                            const service = deviceDescription.device.serviceList[j];
                            if (service.serviceId.split(':')[3] === 'AudioIn') {
                                hostsDictionary[host].audioIn = true;
                            }
                            if (service.serviceId.split(':')[3] === 'HTControl') {
                                hostsDictionary[host].htControl = true;
                            }
                          }
                    }, function() {
                        platform.log('Error while getting device description of ' + host + '.');
                    }));
                }

                // Waits for all promises to resolve
                Promise.all(promises).then(function() {
                    
                    // Creates the zone objects
                    for (let i = 0; i < masterHosts.length; i++) {
                        const host = masterHosts[i];
                        const info = hostsDictionary[host];

                        // Gets the corresponding zone configuration
                        const config = platform.config.zones.find(function(z) { return z.name === info.zoneName; });
                        if (!config) {
                            platform.log('No configuration provided for zone with name ' + info.zoneName + '.');
                            continue;
                        }

                        // Creates the zone instance and adds it to the list of all zones
                        platform.log('Create zone with name ' + info.zoneName + '.');
                        platform.zones.push(new SonosZone(platform, info, config));
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
            }, function() {
                platform.log('Error while initializing plugin.');
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
