/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "u85liyqpqglktyr",
    "created": "2026-09-07 09:06:53.585Z",
    "updated": "2026-09-07 09:06:53.585Z",
    "name": "sys_functional_operating_model_audit",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "5gcrdwic",
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
        "id": "qzbivvfl",
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
        "id": "lxxwv0lj",
        "name": "previous_mode",
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
        "id": "xcovirds",
        "name": "new_mode",
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
        "id": "urzpmayu",
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
        "id": "bqffethk",
        "name": "changed_by",
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
      },
      {
        "system": false,
        "id": "qtsedzqu",
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
  const collection = dao.findCollectionByNameOrId("u85liyqpqglktyr");

  return dao.deleteCollection(collection);
})
