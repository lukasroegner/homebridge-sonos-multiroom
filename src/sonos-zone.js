
/**
 * Represents a Sonos zone.
 * @param platform The SonosMultiroomPlatform instance.
 * @param info The information of the zone.
 * @param config The zone configuration.
 */
function SonosZone(platform, info, config) {
    const zone = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the name, sonos device, slave devices and platform
    zone.name = name;
    zone.sonos = info.sonos;
    zone.sonosSlaves = info.slaves.map(function(s) { return s.sonos; });
    zone.platform = platform;

    // Gets all accessories from the platform that match the zone name
    let unusedDeviceAccessories = platform.accessories.filter(function(a) { return a.context.name === zone.name; });
    let newDeviceAccessories = [];
    let deviceAccessories = [];

    // Gets the outlet accessory
    let outletAccessory = unusedDeviceAccessories.find(function(a) { return a.context.kind === 'OutletAccessory'; });
    if (outletAccessory) {
        unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(outletAccessory), 1);
    } else {
        platform.log('Adding new accessory with zone name ' + zone.name + ' and kind OutletAccessory.');
        outletAccessory = new Accessory(zone.name, UUIDGen.generate(zone.name + 'OutletAccessory'));
        outletAccessory.context.name = zone.name;
        outletAccessory.context.kind = 'OutletAccessory';
        newDeviceAccessories.push(outletAccessory);
    }
    deviceAccessories.push(outletAccessory);

    // Gets the switch accessory
    let switchAccessory = null;
    if (info.htControl && (config.isNightModeEnabled || config.isSpeechEnhancementEnabled)) {
        switchAccessory = unusedDeviceAccessories.find(function(a) { return a.context.kind === 'SwitchAccessory'; });
        if (switchAccessory) {
            unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(switchAccessory), 1);
        } else {
            platform.log('Adding new accessory with zone name ' + zone.name + ' and kind SwitchAccessory.');
            switchAccessory = new Accessory(zone.name + ' Settings', UUIDGen.generate(zone.name + 'SwitchAccessory'));
            outletAccessory.context.name = zone.name;
            switchAccessory.context.kind = 'SwitchAccessory';
            newDeviceAccessories.push(switchAccessory);
        }
        deviceAccessories.push(switchAccessory);
    }

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
            .setCharacteristic(Characteristic.Manufacturer, info.manufacturer)
            .setCharacteristic(Characteristic.Model, info.modelName)
            .setCharacteristic(Characteristic.SerialNumber, info.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, info.softwareVersion)
            .setCharacteristic(Characteristic.HardwareRevision, info.hardwareVersion);
    }

    // Updates the outlet
    let outletService = outletAccessory.getService(Service.Outlet);
    if (!outletService) {
        outletService = outletAccessory.addService(Service.Outlet);
    }
    outletService.setCharacteristic(Characteristic.OutletInUse, true);

    // Stores the outlet service
    zone.outletService = outletService;

    // Updates the night mode switch
    let nightModeSwitchService = null;
    if (switchAccessory && config.isNightModeEnabled) {
        nightModeSwitchService = switchAccessory.getServiceByUUIDAndSubType(Service.Switch, 'NightMode');
        if (!nightModeSwitchService) {
            nightModeSwitchService = switchAccessory.addService(Service.Switch, 'Night Mode', 'NightMode');
        }

        // Stores the service
        device.nightModeSwitchService = nightModeSwitchService;
    }

    // Updates the speech enhancement switch
    let speechEnhancementSwitchService = null;
    if (switchAccessory && config.isSpeechEnhancementEnabled) {
        speechEnhancementSwitchService = switchAccessory.getServiceByUUIDAndSubType(Service.Switch, 'SpeechEnhancement');
        if (!speechEnhancementSwitchService) {
            speechEnhancementSwitchService = switchAccessory.addService(Service.Switch, 'Speech Enhancement', 'SpeechEnhancement');
        }

        // Stores the service
        device.speechEnhancementSwitchService = speechEnhancementSwitchService;
    }

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
                        zone.sonos.joinGroup(priorityZone.name).then(function () {}, function () {
                            zone.platform.log(zone.name + ' - Error while joining group ' + priorityZone.name + '.');
                        });
                    }
                } else {

                    // Tries to just play
                    zone.sonos.play().then(function () {}, function () {
                        zone.platform.log(zone.name + ' - Error while trying to play.');
                    });
                }
            }
        } else {
            zone.platform.log(zone.name + ' - Set outlet state: OFF');
            zone.sonos.leaveGroup().then(function () {}, function () {
                zone.platform.log(zone.name + ' - Error while leaving group.');
            });
        }
        callback(null);
    });

    // Subscribes for changes of the night mode
    if (nightModeSwitchService) {
        nightModeSwitchService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
            zone.platform.log(zone.name + ' - Set night mode: ' + (value ? 'ON' : 'OFF'));
            zone.sonos.renderingControlService()._request('SetEQ', { InstanceID: 0, EQType: 'NightMode', DesiredValue: value ? '1' : '0' }).then(function () {}, function () {
                zone.platform.log(zone.name + ' - Error switching night mode to ' + (value ? 'ON' : 'OFF') + '.');
            });
            callback(null);
        });
    }

    // Subscribes for changes of the speech enhancement
    if (speechEnhancementSwitchService) {
        speechEnhancementSwitchService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
            zone.platform.log(zone.name + ' - Set speech enhancement: ' + (value ? 'ON' : 'OFF'));
            zone.sonos.renderingControlService()._request('SetEQ', { InstanceID: 0, EQType: 'DialogLevel', DesiredValue: value ? '1' : '0' }).then(function () {}, function () {
                zone.platform.log(zone.name + ' - Error switching speech enhancement to ' + (value ? 'ON' : 'OFF') + '.');
            });
            callback(null);
        });
    }

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

    // Subscribes for changes in the rendering control
    zone.sonos.on('RenderingControl', function (eventData) {

        // Updates the night mode
        if (nightModeSwitchService && eventData.NightMode) {
            zone.platform.log(zone.name + ' - Updating night mode: ' + (eventData.NightMode[0].val === '1' ? 'ON' : 'OFF'));
            nightModeSwitchService.updateCharacteristic(Characteristic.On, eventData.NightMode[0].val === '1');
        }

        // Updates the speed enhancement
        if (speechEnhancementSwitchService && eventData.DialogLevel) {
            zone.platform.log(zone.name + ' - Updating speech enhancement: ' + (eventData.DialogLevel[0].val === '1' ? 'ON' : 'OFF'));
            speechEnhancementSwitchService.updateCharacteristic(Characteristic.On, eventData.DialogLevel[0].val === '1');
        }
    });
}

/**
 * Defines the export of the file.
 */
module.exports = SonosZone;
