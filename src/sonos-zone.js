
/**
 * Represents a Sonos zone.
 * @param platform The SonosMultiroomPlatform instance.
 * @param zoneMasterDevice The master device of the zone.
 * @param config The zone configuration.
 */
function SonosZone(platform, zoneMasterDevice, config) {
    const zone = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the master device, name and platform
    zone.masterDevice = zoneMasterDevice;
    zone.name = zoneMasterDevice.zoneName;
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
    if (zone.masterDevice.htControl && (config.isNightModeEnabled || config.isSpeechEnhancementEnabled)) {
        switchAccessory = unusedDeviceAccessories.find(function(a) { return a.context.kind === 'SwitchAccessory'; });
        if (switchAccessory) {
            unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(switchAccessory), 1);
        } else {
            platform.log('Adding new accessory with zone name ' + zone.name + ' and kind SwitchAccessory.');
            switchAccessory = new Accessory(zone.name + ' Settings', UUIDGen.generate(zone.name + 'SwitchAccessory'));
            switchAccessory.context.name = zone.name;
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
            .setCharacteristic(Characteristic.Manufacturer, zone.masterDevice.manufacturer)
            .setCharacteristic(Characteristic.Model, zone.masterDevice.modelName)
            .setCharacteristic(Characteristic.SerialNumber, zone.masterDevice.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, zone.masterDevice.softwareVersion)
            .setCharacteristic(Characteristic.HardwareRevision, zone.masterDevice.hardwareVersion);
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
        zone.nightModeSwitchService = nightModeSwitchService;
    }

    // Updates the speech enhancement switch
    let speechEnhancementSwitchService = null;
    if (switchAccessory && config.isSpeechEnhancementEnabled) {
        speechEnhancementSwitchService = switchAccessory.getServiceByUUIDAndSubType(Service.Switch, 'SpeechEnhancement');
        if (!speechEnhancementSwitchService) {
            speechEnhancementSwitchService = switchAccessory.addService(Service.Switch, 'Speech Enhancement', 'SpeechEnhancement');
        }

        // Stores the service
        zone.speechEnhancementSwitchService = speechEnhancementSwitchService;
    }

    // Subscribes for changes of the on characteristic
    outletService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
        if (value) {
            zone.platform.log(zone.name + ' - Set outlet state: ON');

            // Checks if the zone is already playing, in this case, nothing has to be done
            if (!outletService.getCharacteristic(Characteristic.On).value) {
                if (config.priorities) {
                    zone.platform.log(zone.name + ' - Set outlet state: ON - has priorities');

                    // Cycles over the priority list and checks the play state
                    for (let i = 0; i < config.priorities.length; i++) {
                        const priority = config.priorities[i];
                        zone.platform.log(zone.name + ' - Set outlet state: ON - trying priority ' + (i + 1) + ': ' + priority);

                        // Gets the zone of the priority
                        const priorityZone = zone.platform.zones.find(function(z) { return z.name === priority; });
                        if (!priorityZone) {
                            zone.platform.log(zone.name + ' - Set outlet state: ON - priority not found');
                            continue;
                        }

                        // Checks the outlet state
                        if (!priorityZone.outletService.getCharacteristic(Characteristic.On).value) {
                            zone.platform.log(zone.name + ' - Set outlet state: ON - priority not ON');
                            continue;
                        }

                        // Joins the group
                        zone.platform.log(zone.name + ' - Set outlet state: ON - joining');
                        zone.masterDevice.sonos.joinGroup(priorityZone.name).then(function () {}, function () {
                            zone.platform.log(zone.name + ' - Error while joining group ' + priorityZone.name + '.');
                        });
                        callback(null);
                        return;
                    }

                    // Tries to just play (if auto-play is enabled)
                    if (!config.isAutoPlayDisabled) {
                        zone.platform.log(zone.name + ' - Set outlet state: ON - no priorities matches');
                        zone.masterDevice.sonos.play().then(function () { }, function () {
                            zone.platform.log(zone.name + ' - Error while trying to play.');
                        });
                    } else {
                        zone.platform.log(zone.name + ' - No auto-play');
                        setTimeout(function() { zone.outletService.updateCharacteristic(Characteristic.On, false); }, 250);
                    }
                } else {

                    // Tries to just play (if auto-play is enabled)
                    if (!config.isAutoPlayDisabled) {
                        zone.platform.log(zone.name + ' - Set outlet state: ON - no priorities');
                        zone.masterDevice.sonos.play().then(function () { }, function () {
                            zone.platform.log(zone.name + ' - Error while trying to play.');
                        });
                    } else {
                        zone.platform.log(zone.name + ' - No auto-play');
                        setTimeout(function() { zone.outletService.updateCharacteristic(Characteristic.On, false); }, 250);
                    }
                }
            } else {
                zone.platform.log(zone.name + ' - Set outlet state: ON - already ON');
            }
        } else {
            zone.platform.log(zone.name + ' - Set outlet state: OFF');

            // Checks if the zone is playing back its own TV stream, in this case, nothing should be done
            if (zone.masterDevice.htControl) {
                zone.platform.log(zone.name + ' - Set outlet state: OFF - TV, checking current track');
                zone.masterDevice.sonos.currentTrack().then(function(currentTrack) {
                    if (currentTrack && currentTrack.uri && currentTrack.uri.endsWith(':spdif')) {
                        zone.platform.log(zone.name + ' - Set outlet state: OFF - TV, current track');
                        setTimeout(function() { zone.outletService.updateCharacteristic(Characteristic.On, true); }, 250);
                    } else {
                        zone.platform.log(zone.name + ' - Set outlet state: OFF - TV, not current track, leaving group');
                        zone.masterDevice.sonos.leaveGroup().then(function () {}, function () {
                            zone.platform.log(zone.name + ' - Error while leaving group.');
                        });
                    }
                }, function() {
                    zone.platform.log(zone.name + ' - Error while getting current track.');
                });
            } else {
                zone.platform.log(zone.name + ' - Set outlet state: OFF - Not TV, leaving group');
                zone.masterDevice.sonos.leaveGroup().then(function () {}, function () {
                    zone.platform.log(zone.name + ' - Error while leaving group.');
                });
            }
        }
        callback(null);
    });

    // Subscribes for changes of the night mode
    if (nightModeSwitchService) {
        nightModeSwitchService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
            zone.platform.log(zone.name + ' - Set night mode: ' + (value ? 'ON' : 'OFF'));
            zone.masterDevice.sonos.renderingControlService()._request('SetEQ', { InstanceID: 0, EQType: 'NightMode', DesiredValue: value ? '1' : '0' }).then(function () {}, function () {
                zone.platform.log(zone.name + ' - Error switching night mode to ' + (value ? 'ON' : 'OFF') + '.');
            });
            callback(null);
        });
    }

    // Subscribes for changes of the speech enhancement
    if (speechEnhancementSwitchService) {
        speechEnhancementSwitchService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
            zone.platform.log(zone.name + ' - Set speech enhancement: ' + (value ? 'ON' : 'OFF'));
            zone.masterDevice.sonos.renderingControlService()._request('SetEQ', { InstanceID: 0, EQType: 'DialogLevel', DesiredValue: value ? '1' : '0' }).then(function () {}, function () {
                zone.platform.log(zone.name + ' - Error switching speech enhancement to ' + (value ? 'ON' : 'OFF') + '.');
            });
            callback(null);
        });
    }

    // Subscribes for changes of the transport control
    zone.masterDevice.sonos.on('AVTransport', function () {
        zone.updatePlayState();
    });

    // Subscribes for changes in the rendering control
    zone.masterDevice.sonos.on('RenderingControl', function (eventData) {

        // Updates the night mode
        if (nightModeSwitchService && eventData.NightMode) {
            zone.platform.log(zone.name + ' - Updating night mode: ' + (eventData.NightMode.val === '1' ? 'ON' : 'OFF'));
            zone.nightModeSwitchService.updateCharacteristic(Characteristic.On, eventData.NightMode.val === '1');
        }

        // Updates the speed enhancement
        if (speechEnhancementSwitchService && eventData.DialogLevel) {
            zone.platform.log(zone.name + ' - Updating speech enhancement: ' + (eventData.DialogLevel.val === '1' ? 'ON' : 'OFF'));
            zone.speechEnhancementSwitchService.updateCharacteristic(Characteristic.On, eventData.DialogLevel.val === '1');
        }

        // Updates the play state
        zone.updatePlayState();
    });

    // Subscribes for changes of the group rendering
    zone.masterDevice.sonos.on('RenderingControl', function () {
        zone.updatePlayState();
    });
}

/**
 * Updates the play state of the zone.
 */
SonosZone.prototype.updatePlayState = function () {
    const zone = this;
    const { Characteristic } = zone.platform;

    // Updates the play state based on the group play state
    zone.platform.getGroupPlayState(zone.masterDevice).then(function(playState) {
        zone.platform.log(zone.name + ' - Updated play state: ' + (playState === 'playing' ? 'ON' : 'OFF'));
        zone.outletService.updateCharacteristic(Characteristic.On, playState === 'playing');
    }, function() {
        zone.platform.log(zone.name + ' - Error while updating group play state.');
    });
}

/**
 * Defines the export of the file.
 */
module.exports = SonosZone;
