import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  Service,
  CharacteristicValue,
} from 'homebridge';
import fetch, { RequestInit } from 'node-fetch';

let hap: HAP;

export default (api: API) => {
  hap = api.hap;
  api.registerAccessory(
    'homebridge-http-environment-controller',
    'HttpTemperatureHumiditySensor',
    HttpTemperatureHumidityAccessory,
  );
  api.registerAccessory(
    'homebridge-http-environment-controller',
    'HttpFanController',
    HttpFanControllerAccessory,
  );
};

// ---------------------------------------------------------------------------
// HTTP helper — fetch with 5s timeout
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 5000;

async function fetchJSON<T>(url: string, init: RequestInit = {}): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Accessory 1 — Temperature & Humidity sensor
// ---------------------------------------------------------------------------

class HttpTemperatureHumidityAccessory implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;
  private readonly url: string;
  private readonly manufacturer: string;
  private readonly model: string;
  private readonly serial: string;
  private readonly disableHumidity: boolean;
  private readonly refresh_interval: number;

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
    this.name = config.name;
    this.url = config.url;
    this.manufacturer = config.manufacturer || 'HttpTemperatureHumidity';
    this.model = config.model || 'Default';
    this.serial = config.serial || '18981898';
    this.refresh_interval = config.refresh || 30;
    this.disableHumidity = config.disableHumidity || false;

    this.temperatureService = new hap.Service.TemperatureSensor('Temperature');
    this.temperatureService
      .getCharacteristic(hap.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));
    this.temperatureService
      .getCharacteristic(hap.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));

    this.humidityService = new hap.Service.HumiditySensor('Humidity');
    if (this.disableHumidity !== true) {
      this.humidityService
        .getCharacteristic(hap.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentRelativeHumidity.bind(this));
      this.humidityService
        .getCharacteristic(hap.Characteristic.StatusActive)
        .onGet(this.getStatusActive.bind(this));
    }

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(hap.Characteristic.Model, this.model)
      .setCharacteristic(hap.Characteristic.SerialNumber, this.serial);

    setInterval(() => {
      this.updateAllStates().then(() => {
        this.temperatureService.updateCharacteristic(hap.Characteristic.CurrentTemperature, this.accessoryState.temperature);
        this.temperatureService.updateCharacteristic(hap.Characteristic.StatusActive, this.accessoryState.statusActive);
        if (this.disableHumidity !== true) {
          this.humidityService.updateCharacteristic(hap.Characteristic.CurrentRelativeHumidity, this.accessoryState.humidity);
          this.humidityService.updateCharacteristic(hap.Characteristic.StatusActive, this.accessoryState.statusActive);
        }
      });
    }, this.refresh_interval * 1000);

    this.updateAllStates();
    log.info(`${this.name} finished initializing!`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    const services: Service[] = [this.informationService, this.temperatureService];
    if (this.disableHumidity !== true) services.push(this.humidityService);
    return services;
  }

  getCurrentTemperature(): number {
    return this.accessoryState.temperature;
  }

  getCurrentRelativeHumidity(): number {
    return this.accessoryState.humidity;
  }

  getStatusActive(): boolean {
    return this.accessoryState.statusActive;
  }

  async updateAllStates(): Promise<boolean> {
    let updated = false;
    try {
      const data = await fetchJSON<WeatherStatus>(this.url);
      this.accessoryState.temperature = data.temperature;
      this.accessoryState.humidity = data.humidity;
      updated = true;
    } catch (e) {
      this.log('updateAllStates error: ' + e);
    }
    this.accessoryState.statusActive = updated;
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Accessory 2 — Fan controller
// ---------------------------------------------------------------------------

class HttpFanControllerAccessory implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;
  private readonly url: string;
  private readonly refreshInterval: number;

  private state: {
    targetFanState: CharacteristicValue;
    rotationSpeed: CharacteristicValue;
    active: CharacteristicValue;
  };

  private readonly fanService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig) {
    this.log = log;
    this.name = config.name;
    this.url = config.url;
    this.refreshInterval = (config.refresh || 30) * 1000;

    this.state = {
      targetFanState: hap.Characteristic.TargetFanState.AUTO,
      rotationSpeed: 0,
      active: hap.Characteristic.Active.ACTIVE,
    };

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, config.manufacturer || 'Arduino')
      .setCharacteristic(hap.Characteristic.Model, config.model || 'MKR WiFi 1010')
      .setCharacteristic(hap.Characteristic.SerialNumber, config.serial || '00000001');

    this.fanService = new hap.Service.Fanv2(this.name);

    // Active — reflète la disponibilité de l'Arduino (pas un vrai on/off)
    // Le setTimeout garantit que le push-back part après la réponse SET,
    // sinon le client HomeKit ignore la notification (même tick HAP).
    this.fanService.getCharacteristic(hap.Characteristic.Active)
      .onGet(() => this.state.active)
      .onSet(async (value) => {
        if (value === hap.Characteristic.Active.INACTIVE) {
          await this.postFan('auto');
          this.state.targetFanState = hap.Characteristic.TargetFanState.AUTO;
          this.fanService.updateCharacteristic(hap.Characteristic.TargetFanState, hap.Characteristic.TargetFanState.AUTO);
        }
        // Repasser en ACTIVE après la réponse SET pour que le client reçoive la notification
        setTimeout(() => {
          this.state.active = hap.Characteristic.Active.ACTIVE;
          this.fanService.updateCharacteristic(hap.Characteristic.Active, hap.Characteristic.Active.ACTIVE);
        }, 300);
      });

    // TargetFanState — AUTO / MANUAL
    this.fanService.getCharacteristic(hap.Characteristic.TargetFanState)
      .onGet(() => this.state.targetFanState)
      .onSet(async (value) => {
        const isAuto = value === hap.Characteristic.TargetFanState.AUTO;
        await this.postFan(isAuto ? 'auto' : 'manual', isAuto ? undefined : this.state.rotationSpeed as number);
        this.state.targetFanState = value;
      });

    // RotationSpeed — slider 0-100%
    this.fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
      .onGet(() => this.state.rotationSpeed)
      .onSet(async (value) => {
        const speed = value as number;
        await this.postFan('manual', speed);
        this.state.rotationSpeed = speed;
        // Changer la vitesse bascule automatiquement en manuel
        this.state.targetFanState = hap.Characteristic.TargetFanState.MANUAL;
        this.fanService.updateCharacteristic(hap.Characteristic.TargetFanState, hap.Characteristic.TargetFanState.MANUAL);
      });

    setInterval(() => this.syncState(), this.refreshInterval);
    this.syncState();
    log.info(`${this.name} initialized`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    return [this.informationService, this.fanService];
  }

  private async postFan(mode: 'auto' | 'manual', speedPct?: number): Promise<void> {
    const body = mode === 'manual'
      ? { mode, speed_pct: speedPct ?? 50 }
      : { mode };
    try {
      await fetchJSON<FanStatus>(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.log.error(`Fan POST failed: ${e}`);
    }
  }

  private async syncState(): Promise<void> {
    try {
      const data = await fetchJSON<FanStatus>(this.url);

      this.state.targetFanState = data.mode === 'auto'
        ? hap.Characteristic.TargetFanState.AUTO
        : hap.Characteristic.TargetFanState.MANUAL;
      this.state.rotationSpeed = data.speed_pct;
      this.state.active = hap.Characteristic.Active.ACTIVE;

      this.fanService.updateCharacteristic(hap.Characteristic.TargetFanState, this.state.targetFanState);
      this.fanService.updateCharacteristic(hap.Characteristic.RotationSpeed, this.state.rotationSpeed);
      this.fanService.updateCharacteristic(hap.Characteristic.Active, this.state.active);
    } catch (e) {
      this.log.error(`Fan sync failed: ${e}`);
      this.state.active = hap.Characteristic.Active.INACTIVE;
      this.fanService.updateCharacteristic(hap.Characteristic.Active, hap.Characteristic.Active.INACTIVE);
    }
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface WeatherStatus {
  readonly temperature: number;
  readonly humidity: number;
}

interface FanStatus {
  readonly mode: 'auto' | 'manual';
  readonly speed_pct: number;
  readonly temperature: number;
}
