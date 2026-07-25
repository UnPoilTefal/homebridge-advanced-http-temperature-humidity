# homebridge-http-environment-controller

Plugin Homebridge pour exposer les données d'une station météo Arduino en tant qu'accessoires HomeKit.

Deux accessoires distincts sont disponibles :

| Accessoire | Service HomeKit | Usage |
|---|---|---|
| `HttpTemperatureHumiditySensor` | TemperatureSensor + HumiditySensor | Lecture capteurs |
| `HttpFanController` | Fanv2 | Contrôle ventilateur PWM |

Conçu pour fonctionner avec un [Arduino MKR WiFi 1010](https://github.com/UnPoilTefal/mkr_weather_station) mais compatible avec tout endpoint HTTP retournant le bon format JSON.

---

## Installation

Via l'interface Homebridge UI ou en ligne de commande :

```bash
npm install -g homebridge-http-environment-controller
```

---

## Accessoire 1 — Capteur température & humidité

### Paramètres

| Paramètre | Description | Défaut | Requis |
|---|---|---|---|
| `accessory` | `HttpTemperatureHumiditySensor` | — | oui |
| `name` | Nom de l'accessoire dans HomeKit | — | oui |
| `url` | URL complète de l'endpoint capteurs | — | oui |
| `refresh` | Intervalle de rafraîchissement (secondes) | `30` | non |
| `disableHumidity` | Désactiver le service humidité | `false` | non |
| `manufacturer` | Fabricant affiché dans HomeKit | `HttpTemperatureHumidity` | non |
| `model` | Modèle affiché dans HomeKit | `Default` | non |
| `serial` | Numéro de série affiché dans HomeKit | `18981898` | non |

### Format de réponse attendu

```json
{
  "temperature": 24.5,
  "humidity": 45.2
}
```

### Exemple de configuration

```json
{
  "accessory": "HttpTemperatureHumiditySensor",
  "name": "Rack Temp",
  "url": "http://192.168.1.10/weather/status",
  "refresh": 30
}
```

---

## Accessoire 2 — Contrôleur ventilateur

Expose un service **Fanv2** HomeKit avec :
- **Auto / Manuel** (`TargetFanState`) — toggle principal
- **Vitesse** (`RotationSpeed`) — slider 0-100% (actif en mode Manuel)
- **Actif** (`Active`) — grisé automatiquement si l'Arduino est hors ligne

Comportements :
- Ajuster le slider de vitesse bascule automatiquement en mode Manuel
- Appuyer sur "éteindre" dans l'app Home repasse en Auto (le rack ne s'arrête jamais)

### Paramètres

| Paramètre | Description | Défaut | Requis |
|---|---|---|---|
| `accessory` | `HttpFanController` | — | oui |
| `name` | Nom de l'accessoire dans HomeKit | — | oui |
| `url` | URL complète de l'endpoint ventilateur | — | oui |
| `refresh` | Intervalle de synchronisation (secondes) | `30` | non |
| `manufacturer` | Fabricant affiché dans HomeKit | `Arduino` | non |
| `model` | Modèle affiché dans HomeKit | `MKR WiFi 1010` | non |
| `serial` | Numéro de série affiché dans HomeKit | `00000001` | non |

### Appels HTTP effectués

| Action HomeKit | Requête |
|---|---|
| Lecture état | `GET /fan` |
| Passer en Auto | `POST /fan` `{"mode":"auto"}` |
| Passer en Manuel | `POST /fan` `{"mode":"manual","speed_pct":N}` |
| Changer la vitesse | `POST /fan` `{"mode":"manual","speed_pct":N}` |

### Format de réponse attendu (`GET /fan`)

```json
{
  "mode": "auto",
  "speed_pct": 42,
  "temperature": 34.1
}
```

### Exemple de configuration

```json
{
  "accessory": "HttpFanController",
  "name": "Rack Fan",
  "url": "http://192.168.1.10/fan",
  "refresh": 30
}
```

---

## Configuration complète

```json
{
  "bridge": {
    "name": "Homebridge",
    "username": "CD:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-156"
  },
  "accessories": [
    {
      "accessory": "HttpTemperatureHumiditySensor",
      "name": "Rack Temp",
      "url": "http://192.168.1.10/weather/status",
      "refresh": 30
    },
    {
      "accessory": "HttpFanController",
      "name": "Rack Fan",
      "url": "http://192.168.1.10/fan",
      "refresh": 30
    }
  ]
}
```
