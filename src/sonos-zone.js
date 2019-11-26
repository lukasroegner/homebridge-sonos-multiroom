
const { Sonos } = require('sonos');

/**
 * Represents a Sonos zone.
 * @param platform The SonosMultiroomPlatform instance.
 * @param name The zone name.
 * @param hosts The list of hosts (IP addresses).
 * @param config The zone configuration.
 */
function SonosZone(platform, name, hosts, config) {
    const zone = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the name, hosts and platform
    zone.name = name;
    zone.hosts = hosts;
    zone.platform = platform;

    // Initializes the current track
    zone.currentTrack = null;

    // Initializes the Sonos device
    zone.sonos = new Sonos(zone.hosts[0]);

    // Gets all accessories from the platform that match the zone name
    let unusedDeviceAccessories = platform.accessories.filter(function(a) { return a.context.name === config.name; });
    let newDeviceAccessories = [];
    let deviceAccessories = [];

    // Gets the outlet accessory
    let outletAccessory = unusedDeviceAccessories.find(function(a) { return a.context.kind === 'OutletAccessory'; });
    if (outletAccessory) {
        unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(outletAccessory), 1);
    } else {
        platform.log('Adding new accessory with zone name ' + config.name + ' and kind OutletAccessory.');
        outletAccessory = new Accessory(config.name, UUIDGen.generate(config.name + 'OutletAccessory'));
        outletAccessory.context.name = config.name;
        outletAccessory.context.kind = 'OutletAccessory';
        newDeviceAccessories.push(outletAccessory);
    }
    deviceAccessories.push(outletAccessory);

    // Registers the newly created accessories
    platform.api.registerPlatformAccessories(platform.pluginName, platform.platformName, newDeviceAccessories);

    // Removes all unused accessories
    for (let i = 0; i < unusedDeviceAccessories.length; i++) {
        const unusedDeviceAccessory = unusedDeviceAccessories[i];
        platform.log('Removing unused accessory with zone name ' + unusedDeviceAccessory.context.name + ' and kind ' + unusedDeviceAccessory.context.kind + '.');
        platform.accessories.splice(platform.accessories.indexOf(unusedDeviceAccessory), 1);
    }
    platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, unusedDeviceAccessories);

    // Updates the accessory information
    for (let i = 0; i < deviceAccessories.length; i++) {
        const deviceAccessory = deviceAccessories[i];
        let accessoryInformationService = deviceAccessory.getService(Service.AccessoryInformation);
        if (!accessoryInformationService) {
            accessoryInformationService = deviceAccessory.addService(Service.AccessoryInformation);
        }
        accessoryInformationService
            .setCharacteristic(Characteristic.Manufacturer, 'Sonos')
            .setCharacteristic(Characteristic.Model, 'TODO')
            .setCharacteristic(Characteristic.SerialNumber, config.name);
    }

    // Updates the outlet
    let outletService = outletAccessory.getService(Service.Outlet);
    if (!outletService) {
        outletService = outletAccessory.addService(Service.Outlet);
    }
    outletService.setCharacteristic(Characteristic.OutletInUse, true);

    // Stores the outlet service
    zone.outletService = outletService;

    // Subscribes for changes of the on characteristic
    outletService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
        if (value) {
            zone.platform.log(zone.name + ' - Set outlet state: ON');

            // Checks if the zone is already playing, in this case, nothing has to be done
            if (!outletService.getCharacteristic(Characteristic.On).value) {
                if (config.priorities) {

                    // Cycles over the priority list and checks the play state
                    for (let i = 0; i < config.priorities.length; i++) {
                        const priority = config.priorities[i];

                        // Gets the zone of the priority
                        const priorityZone = zone.platform.zones.find(function(z) { return z.name === priority; });
                        if (!priorityZone) {
                            continue;
                        }

                        // Checks the outlet state
                        if (!priorityZone.outletService.getCharacteristic(Characteristic.On).value) {
                            continue;
                        }

                        // Joins the group
                        zone.sonos.joinGroup(priorityZone.name);
                    }
                } else {

                    // Tries to just play
                    zone.sonos.play();
                }
            }
        } else {
            zone.platform.log(zone.name + ' - Set outlet state: OFF');
            zone.sonos.leaveGroup();
        }
        callback(null);
    });

    // Subscribes for changes in the play state
    zone.sonos.on('PlayState', function (playState) {
        if (playState === 'playing' || playState === 'paused') {
            zone.platform.log(zone.name + ' - Updating outlet state: ' + (playState === 'playing' ? 'ON' : 'OFF'));
            zone.outletService.updateCharacteristic(Characteristic.On, playState === 'playing');
        }
    });
    zone.sonos.on('PlaybackStopped', function () {
        zone.platform.log(zone.name + ' - Updating outlet state: OFF');
        zone.outletService.updateCharacteristic(Characteristic.On, false);
    });
}

/**
 * Defines the export of the file.
 */
module.exports = SonosZone;
