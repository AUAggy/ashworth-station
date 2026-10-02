# Tuning tables

All balance lives in data. Weapon definitions sit in one object, enemy stats in one table, wave recipes in the director. Changing the game means editing a number, not untangling a branch.

## Weapons

| | M9 Sidearm | MK9 SMG | 870 Pump |
|---|---|---|---|
| Fire | Semi-auto | Full-auto | Pump-action |
| Damage | 38 | 21 | 19 x 9 pellets |
| Rate | 330 rpm | 820 rpm | 78 rpm |
| Magazine | 15 | 32 | 6 |
| Reserve (max) | 120 (180) | 280 (400) | 48 (80) |
| Reload | 1.35 s | 1.85 s | 2.6 s |
| Hip spread | 0.006 | 0.019 | 0.075 |
| ADS spread | 0.0016 | 0.008 | 0.046 |
| Headshot mult | 2.9x | 2.2x | 1.7x per pellet |
| ADS field of view | 62 | 57 | 60 |

## Enemies (wave 1, HERO)

| | Walker | Runner | Crawler | Brute | Conductor |
|---|---|---|---|---|---|
| HP | 100 | 66 | 58 | 420 | 750 |
| Speed | 1.55 | 3.35 | 2.55 | 1.15 | 1.0 |
| Damage | 7 | 6 | 9 | 18 | 24 |
| Swing gap | 1.05 s | 0.85 s | 0.95 s | 1.35 s | 1.20 s |
| Windup | 0.24 s | 0.18 s | 0.18 s | 0.34 s | 0.34 s |
| Reach | 1.95 | 1.85 | 1.60 | 2.35 | 2.7 |
| Scale | 0.92 | 0.82 | 0.95 | 1.32 | 1.85 |
| Points | 100 | 150 | 180 | 400 | 1500 |
| Eyes | yellow-green | green | cyan | orange | red |
| First wave | 1 | 3 | 3 | 5 | 15 |

The conductor is the uniformed one, just over twice as tall as a walker, and it arrives only on the last train. The red eyes are the warning.

Damage per hit is lower here than it used to be, which reads backwards until you know why. Attacks used to miss a moving player almost entirely; once they started landing on schedule, the old numbers killed a full-health player in about two seconds. The difficulty moved from the size of the hit to the certainty of it.

## Scaling

Per wave, per NG+ level, per difficulty. These run at spawn:

```js
hp:    base * (1 + (wave - 1) * 0.11) * pow(1.30, ngP)  * (easy ? 0.8 : 1)
speed: base * (1 + min(0.55, (wave - 1) * 0.045)) * (1 + min(0.6, 0.12 * ngP))
dmg:   (base + (wave - 1) * 0.55) * (1 + 0.25 * ngP) * (easy ? 0.6 : 1)
```

Each zombie also rolls a speed jitter between 0.9x and 1.12x, so the same wave never moves the same way twice.

On the player's side of the ledger: regeneration starts 10 seconds after the last hit and runs at 4 HP/s, stopping at 70. On EASY that is 8 seconds, 6 HP/s and a ceiling of 85. Medkits restore 35 and drop only while you are below roughly 60.

