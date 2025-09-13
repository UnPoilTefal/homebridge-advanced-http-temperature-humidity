import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';
import fetch from 'node-fetch';

let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export default (api: API) => {
  hap = api.hap;
  api.registerAccessory(
    'homebridge-http-temperature-humidity-sensor',
    'HttpTemperatureHumiditySensor',
    HttpTemperatureHumidityAccessory,
  );
};

class HttpTemperatureHumidityAccessory implements AccessoryPlugin {
  private readonly log: Logging;

  //Config
  private readonly name: string;
  private readonly url: string;
  private readonly manufacturer: string;
  private readonly model: string;
  private readonly serial: string;
  private readonly disableHumidity: boolean;
  private readonly refresh_interval: number;

  /* Characteristic States */
  private accessoryState = {
    temperature: 0,
    humidity: 0,
    statusActive: false,
  };

  private readonly temperatureService: Service;
  private readonly humidityService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig) {
    this.log = log;

    //Retrieve Configuration
    this.name = config.name;
    this.url = config.url;
    this.manufacturer = config.manufacturer || 'HttpTemperatureHumidity';
    this.model = config.model || 'Default';
    this.serial = config.serial || '18981898';
    this.refresh_interval = config.refresh || 30;

    this.disableHumidity = config.disableHumidity || false;

    // Define TemperatureService
    this.temperatureService = new hap.Service.TemperatureSensor('Temperature');
    this.temperatureService
      .getCharacteristic(hap.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));
    this.temperatureService
      .getCharacteristic(hap.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));

    // Define HumidityService
    this.humidityService = new hap.Service.HumiditySensor('Humidity');
    if (this.disableHumidity !== true) {
      this.humidityService
        .getCharacteristic(hap.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentRelativeHumidity.bind(this));
      this.humidityService
        .getCharacteristic(hap.Characteristic.StatusActive)
        .onGet(this.getStatusActive.bind(this));
    }

    // Define InformationService
    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(hap.Characteristic.Model, this.model)
      .setCharacteristic(hap.Characteristic.SerialNumber, this.serial);

    setInterval(() => {
      this.log.debug('Triggering updateAccessoryState');
      this.updateAllStates()
        .then(() => {
          // push the new value to HomeKit
          this.temperatureService.updateCharacteristic(hap.Characteristic.CurrentTemperature, this.accessoryState.temperature);
          this.temperatureService.updateCharacteristic(hap.Characteristic.StatusActive, this.accessoryState.statusActive);
          if (this.disableHumidity !== true) {
            this.humidityService.updateCharacteristic(hap.Characteristic.CurrentRelativeHumidity, this.accessoryState.humidity);
            this.humidityService.updateCharacteristic(hap.Characteristic.StatusActive, this.accessoryState.statusActive);
          }
        });
    }, this.getRefreshIntervalInMillis());

    //Initialize state
    this.updateAllStates();
    log.info(`${this.name} finished initializing!`);
    log.debug(`Will refresh state every ${this.refresh_interval}sec`);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log('Identify!');
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    const services: Array<Service> = new Array<Service>(
      this.informationService,
      this.temperatureService,
    );
    if (this.disableHumidity !== true) {
      services.push(this.humidityService);
    }

    return services;
  }

  getCurrentTemperature(): number {
    const currentTemperature = this.accessoryState.temperature;
    this.log('getCurrentTemperature: ' + currentTemperature);
    return currentTemperature;
  }

  getCurrentRelativeHumidity() {
    const currentRelativeHumidity = this.accessoryState.humidity;
    this.log('getCurrentRelativeHumidity: ' + currentRelativeHumidity);
    return currentRelativeHumidity;
  }

  getStatusActive(): boolean {
    const currentStatusActive = this.accessoryState.statusActive;
    this.log('getCurrentStatusActive: ' + currentStatusActive);
    return currentStatusActive;
  }

  async updateAllStates() {
    let updated = false;
    await this.callServer()
      .then((temperatureAndHumidity: TemperatureAndHumidity) => {
        this.log.debug('CallServerResponse: Temperature: '
          + temperatureAndHumidity.temperature
          + ' Humidity: '
          + temperatureAndHumidity.humidity);
        this.accessoryState.temperature = temperatureAndHumidity.temperature;
        this.accessoryState.humidity = temperatureAndHumidity.humidity;
        updated = true;
      })
      .catch((error) => {
        this.log('updateAllStates Error : ' + error.message);
      });
    this.accessoryState.statusActive = updated;
    return updated;
  }

  async callServer(): Promise<TemperatureAndHumidity> {
    const response = await fetch(this.url);
    return response.json() as Promise<TemperatureAndHumidity>;
  }

  private getRefreshIntervalInMillis(): number {
    return this.refresh_interval * 1000;
  }

}
interface TemperatureAndHumidity {
  readonly temperature: number;
  readonly humidity: number;
}