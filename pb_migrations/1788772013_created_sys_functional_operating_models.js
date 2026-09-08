/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "rw3sucobnus4idn",
    "created": "2026-09-07 09:06:53.491Z",
    "updated": "2026-09-07 09:06:53.491Z",
    "name": "sys_functional_operating_models",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "w6uo3uih",
        "name": "management_group",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "3sy4wnp8d6z3ys4",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "u4tbxtuj",
        "name": "function_domain",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "hr",
            "finance",
            "sales",
            "warehouse",
            "purchasing",
            "pos"
          ]
        }
      },
      {
        "system": false,
        "id": "qnl9lmea",
        "name": "mode",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "SHARED",
            "SEPARATED"
          ]
        }
      },
      {
        "system": false,
        "id": "vsvvzxwf",
        "name": "shared_scope_kind",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "ALL_IN_MANAGEMENT",
            "SELECTED"
          ]
        }
      },
      {
        "system": false,
        "id": "l4whuutp",
        "name": "effective_from",
        "type": "date",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      },
      {
        "system": false,
        "id": "qqhswzdg",
        "name": "notes",
        "type": "text",
        "required": false,
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
        "id": "qysh2ufi",
        "name": "updated_by",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("rw3sucobnus4idn");

  return dao.deleteCollection(collection);
})
