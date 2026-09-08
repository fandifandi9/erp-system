/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "jiw3qpv4ay4t7tp",
    "created": "2026-08-28 07:44:56.936Z",
    "updated": "2026-08-28 07:44:56.936Z",
    "name": "push_tokens",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "ml5vtkyc",
        "name": "user",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "z90k0ldw",
        "name": "token",
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
        "id": "vv47pkal",
        "name": "platform",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "android",
            "ios"
          ]
        }
      },
      {
        "system": false,
        "id": "phdcnrrz",
        "name": "device_id",
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
        "id": "ppapyfn1",
        "name": "is_active",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "jr1inxga",
        "name": "last_seen",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id = user",
    "viewRule": "@request.auth.id = user",
    "createRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id = user",
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("jiw3qpv4ay4t7tp");

  return dao.deleteCollection(collection);
})
