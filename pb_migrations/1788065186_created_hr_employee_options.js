/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "g9vundbpq14yiuj",
    "created": "2026-08-30 04:46:26.855Z",
    "updated": "2026-08-30 04:46:26.855Z",
    "name": "hr_employee_options",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "hoz5m0sr",
        "name": "category",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "position",
            "department",
            "division"
          ]
        }
      },
      {
        "system": false,
        "id": "fcjwzcxd",
        "name": "name",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "w6bkb7oe",
        "name": "sort_order",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "tfebjdy5",
        "name": "is_active",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "createRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role = \"owner\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role = \"owner\")",
    "deleteRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\")",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("g9vundbpq14yiuj");

  return dao.deleteCollection(collection);
})
