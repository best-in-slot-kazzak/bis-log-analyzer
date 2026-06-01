// Example data — copy to data.js to preview the public app without the admin tool
window.WCL_DASHBOARD_DATA = {
  "version": 2,
  "generatedAt": "2026-05-27T00:00:00.000Z",
  "players": [
    { "id": "1", "name": "Tankman", "class": "Warrior" },
    { "id": "2", "name": "Healbot", "class": "Paladin" },
    { "id": "3", "name": "Dotspammer", "class": "Warlock" },
    { "id": "4", "name": "Clickyclicky", "class": "Mage" },
    { "id": "5", "name": "Stabmaster", "class": "Rogue" }
  ],
  "bosses": [
    {
      "id": "lura-mythic",
      "name": "Lura",
      "difficulty": "Mythic",
      "encounterId": 2874,
      "imageUrl": "",
      "wipeReasons": [
        { "id": "unknown",           "label": "Unknown",            "color": "#6b7280" },
        { "id": "missed-interrupt",  "label": "Missed Interrupt",   "color": "#ef4444" },
        { "id": "wrong-position",    "label": "Wrong Positioning",  "color": "#f59e0b" },
        { "id": "too-much-damage",   "label": "Too Much Damage",    "color": "#8b5cf6" },
        { "id": "mechanic-fail",     "label": "Mechanic Fail",      "color": "#06b6d4" }
      ],
      "playerReviewConfig": {
        "abilities": [
          { "id": "terminate",   "label": "Terminate",    "abilityId": 1286276 },
          { "id": "soul-shear",  "label": "Soul Shear",   "abilityId": 1286230 }
        ],
        "potionAuras": ["Tempered Potion"]
      },
      "widgets": [
        { "id": "team-performance", "type": "teamPerformance", "title": "Team Performance", "enabled": true, "order": 0 },
        { "id": "wipe-reasons",     "type": "wipeReasons",     "title": "Wipe Reasons",     "enabled": true, "order": 1 },
        { "id": "player-review",    "type": "playerReview",    "title": "Player Review",    "enabled": true, "order": 2 }
      ],
      "reports": [
        {
          "id": "report-ABC123",
          "code": "ABC123",
          "name": "Raid Night 1",
          "startedAt": "2026-05-20T19:00:00.000Z",
          "pulls": [
            {
              "id": "ABC123-1", "fightId": 1, "phase": 1, "bossHpPercent": 72, "duration": 48000,
              "startedAt": "2026-05-20T19:02:00.000Z",
              "manualWipeReason": { "reasonId": "mechanic-fail", "playerId": null, "source": "manual" },
              "deaths": [{ "playerId": "3", "playerName": "Dotspammer", "abilityId": 1286230, "abilityName": "Soul Shear", "time": 45000, "lastHits": [] }],
              "damageTaken": [
                { "playerId": "1", "playerName": "Tankman", "abilityId": 1286276, "abilityName": "Terminate", "hits": 3, "total": 450000 },
                { "playerId": "3", "playerName": "Dotspammer", "abilityId": 1286230, "abilityName": "Soul Shear", "hits": 1, "total": 600000 }
              ],
              "potionUsage": [
                { "playerId": "1", "playerName": "Tankman", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "2", "playerName": "Healbot", "used": false, "count": 0, "potionName": null, "potions": [] },
                { "playerId": "3", "playerName": "Dotspammer", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "4", "playerName": "Clickyclicky", "used": false, "count": 0, "potionName": null, "potions": [] },
                { "playerId": "5", "playerName": "Stabmaster", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] }
              ],
              "interrupts": [], "dispels": [], "participants": ["1","2","3","4","5"]
            },
            {
              "id": "ABC123-2", "fightId": 2, "phase": 1, "bossHpPercent": 65, "duration": 62000,
              "startedAt": "2026-05-20T19:12:00.000Z",
              "autoWipeReason": { "reasonId": "missed-interrupt", "playerId": "4", "source": "lura-terminate" },
              "deaths": [{ "playerId": "4", "playerName": "Clickyclicky", "abilityId": 1286276, "abilityName": "Terminate", "time": 59000, "lastHits": [] }],
              "damageTaken": [
                { "playerId": "1", "playerName": "Tankman", "abilityId": 1286276, "abilityName": "Terminate", "hits": 4, "total": 620000 },
                { "playerId": "4", "playerName": "Clickyclicky", "abilityId": 1286276, "abilityName": "Terminate", "hits": 1, "total": 900000 }
              ],
              "potionUsage": [
                { "playerId": "1", "playerName": "Tankman", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "2", "playerName": "Healbot", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "3", "playerName": "Dotspammer", "used": false, "count": 0, "potionName": null, "potions": [] },
                { "playerId": "4", "playerName": "Clickyclicky", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "5", "playerName": "Stabmaster", "used": false, "count": 0, "potionName": null, "potions": [] }
              ],
              "interrupts": [], "dispels": [], "participants": ["1","2","3","4","5"]
            },
            {
              "id": "ABC123-3", "fightId": 3, "phase": 2, "bossHpPercent": 41, "duration": 95000,
              "startedAt": "2026-05-20T19:25:00.000Z",
              "manualWipeReason": { "reasonId": "wrong-position", "playerId": "2", "source": "manual" },
              "deaths": [
                { "playerId": "2", "playerName": "Healbot", "abilityId": 1286230, "abilityName": "Soul Shear", "time": 90000, "lastHits": [] },
                { "playerId": "5", "playerName": "Stabmaster", "abilityId": 1286230, "abilityName": "Soul Shear", "time": 91000, "lastHits": [] }
              ],
              "damageTaken": [
                { "playerId": "1", "playerName": "Tankman", "abilityId": 1286276, "abilityName": "Terminate", "hits": 6, "total": 780000 },
                { "playerId": "2", "playerName": "Healbot", "abilityId": 1286230, "abilityName": "Soul Shear", "hits": 1, "total": 1100000 },
                { "playerId": "5", "playerName": "Stabmaster", "abilityId": 1286230, "abilityName": "Soul Shear", "hits": 1, "total": 950000 }
              ],
              "potionUsage": [
                { "playerId": "1", "playerName": "Tankman", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "2", "playerName": "Healbot", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "3", "playerName": "Dotspammer", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "4", "playerName": "Clickyclicky", "used": false, "count": 0, "potionName": null, "potions": [] },
                { "playerId": "5", "playerName": "Stabmaster", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] }
              ],
              "interrupts": [], "dispels": [], "participants": ["1","2","3","4","5"]
            }
          ]
        },
        {
          "id": "report-DEF456",
          "code": "DEF456",
          "name": "Raid Night 2",
          "startedAt": "2026-05-22T19:00:00.000Z",
          "pulls": [
            {
              "id": "DEF456-1", "fightId": 1, "phase": 2, "bossHpPercent": 38, "duration": 101000,
              "startedAt": "2026-05-22T19:05:00.000Z",
              "manualWipeReason": { "reasonId": "too-much-damage", "playerId": null, "source": "manual" },
              "deaths": [
                { "playerId": "1", "playerName": "Tankman", "abilityId": 1286276, "abilityName": "Terminate", "time": 98000, "lastHits": [] }
              ],
              "damageTaken": [
                { "playerId": "1", "playerName": "Tankman", "abilityId": 1286276, "abilityName": "Terminate", "hits": 8, "total": 1200000 }
              ],
              "potionUsage": [
                { "playerId": "1", "playerName": "Tankman", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "2", "playerName": "Healbot", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "3", "playerName": "Dotspammer", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "4", "playerName": "Clickyclicky", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "5", "playerName": "Stabmaster", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] }
              ],
              "interrupts": [], "dispels": [], "participants": ["1","2","3","4","5"]
            },
            {
              "id": "DEF456-2", "fightId": 2, "phase": 3, "bossHpPercent": 12, "duration": 148000,
              "startedAt": "2026-05-22T19:22:00.000Z",
              "autoWipeReason": { "reasonId": "missed-interrupt", "playerId": "3", "source": "lura-terminate" },
              "deaths": [
                { "playerId": "3", "playerName": "Dotspammer", "abilityId": 1286276, "abilityName": "Terminate", "time": 145000, "lastHits": [] }
              ],
              "damageTaken": [
                { "playerId": "1", "playerName": "Tankman", "abilityId": 1286276, "abilityName": "Terminate", "hits": 10, "total": 1500000 },
                { "playerId": "3", "playerName": "Dotspammer", "abilityId": 1286276, "abilityName": "Terminate", "hits": 1, "total": 800000 }
              ],
              "potionUsage": [
                { "playerId": "1", "playerName": "Tankman", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "2", "playerName": "Healbot", "used": false, "count": 0, "potionName": null, "potions": [] },
                { "playerId": "3", "playerName": "Dotspammer", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "4", "playerName": "Clickyclicky", "used": true, "count": 1, "potionName": "Tempered Potion", "potions": [] },
                { "playerId": "5", "playerName": "Stabmaster", "used": false, "count": 0, "potionName": null, "potions": [] }
              ],
              "interrupts": [], "dispels": [], "participants": ["1","2","3","4","5"]
            }
          ]
        }
      ]
    }
  ]
};
