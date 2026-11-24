# Band firmware (ESP32-C3)

> **Status: written, not compiled or tested on hardware.** We had no band hardware for Round 3.
> The same logic runs in the virtual band (`web/js/band.js`). That version is tested end to end
> against the real server, gateways and database. The packet and receipt formats here match
> `backend/app/protocol.py` field for field.

## What the firmware does

| Feature | How |
|---|---|
| Learns the child's normal heart rate | Running mean and variance of still, worn readings (one every 10 s), saved to flash. It never learns from a raised reading. |
| Notices tension | Still for 2 min **and** heart rate above `mean + max(15, 2.5 × sd)` for 90 s. At most one question every 45 min. |
| Asks | Three soft buzzes. 1 tap = okay, 2 = not great (then a slow calm-down buzz for 30 s), 3 = I want to talk. No answer in 60 s = skipped. |
| Talk any time | Three taps. |
| Help now | Hold 5 s (long buzz), then press once within 6 s. Hold 2 s within 60 s to cancel. |
| Sends | A 19-byte message in BLE manufacturer data: `ver | rotating id | counter | AES-CCM(type, value) | tag`. Retries at 0, 2, 5, 15 and 60 s until a receipt arrives. |
| Knows it arrived | A gateway writes the server's 22-byte receipt to characteristic `7f1c0002-…`. The band checks it with its own key: **one buzz** = the school's database has it. After 5 failed tries: **two buzzes**, and it keeps trying. |
| Keeps time | The 15-minute epoch is corrected from each verified receipt. After a power loss, a gateway can write the epoch to `7f1c0003-…`; that is accepted only until the first verified receipt. |
| Privacy | No device name. The only identifier on air is the rotating id, which changes every 15 minutes. |

## Parts (about ₹900 per band at 1,000 units, before the case and strap)

| Part | Example | Approx. price |
|---|---|---|
| Microcontroller + BLE | ESP32-C3 SuperMini | ₹250 |
| Heart rate (PPG) | MAX30102 module | ₹180 |
| Motion | MPU6050 module | ₹110 |
| Vibration motor | 10 mm coin motor + 2N2222 + 1N4148 | ₹40 |
| Button | 6 mm tactile, sealed | ₹10 |
| Battery + charger | 150–250 mAh LiPo + TP4056 | ₹180 |
| Battery sense | 2 × 100 kΩ divider | ₹2 |

Prices are rough Indian retail figures for prototype parts, not supplier quotes.

## Wiring

| ESP32-C3 | To |
|---|---|
| GPIO 8 (SDA), GPIO 9 (SCL) | MAX30102 and MPU6050 (I2C, 3.3 V) |
| GPIO 3 | Button to GND (internal pull-up) |
| GPIO 4 | Motor transistor base through 1 kΩ |
| GPIO 0 | Battery divider midpoint |

## Build and flash

1. Arduino IDE 2 or arduino-cli with the **esp32** core 3.x. Board: *ESP32C3 Dev Module*, USB CDC on boot: enabled.
2. Libraries: **NimBLE-Arduino 1.4.x** (h2zero) and **SparkFun MAX3010x Pulse and Proximity Sensor**.
3. Flash `band.ino`.
4. On first boot the band waits for its key. Run on the school laptop:
   `python tools/provision_band.py --band 2001 --student S7B05 --port /dev/ttyACM0`
   This creates a random key, saves it on the server, and writes it to the band once.

## Known gaps (to do with hardware)

- Not compiled yet: the NimBLE 2.x callback signatures differ from 1.4.x.
- Battery life is not measured. Target: one school day plus margin, charged nightly. Measures: advertising only while a message is pending, the PPG sampled in short bursts.
- The PPG threshold (`ir > 50000`) and the motion threshold (`0.08 g`) need tuning on real wrists, including darker skin tones, where PPG readings are known to be weaker.
- The gateway's Bluetooth path (`gateway/gateway.py --ble`) is also untested. It does not write the time beacon yet.
