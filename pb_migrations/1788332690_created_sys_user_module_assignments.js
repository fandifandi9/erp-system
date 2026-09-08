/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "erp2zbl6h90n9ae",
    "created": "2026-09-02 07:04:50.894Z",
    "updated": "2026-09-02 07:04:50.894Z",
    "name": "sys_user_module_assignments",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "23svxdle",
        "name": "user",
        "type": "relation",
        "required": true,
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
        "id": "44irdaza",
        "name": "module_id",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "hr",
            "finance",
            "warehouse",
            "purchasing",
            "sales",
            "pos"
          ]
        }
      },
      {
        "system": false,
        "id": "isto95wn",
        "name": "access_mode",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "full",
            "custom"
          ]
        }
      },
      {
        "system": false,
        "id": "8wzd974k",
        "name": "entity_scope_mode",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "selected",
            "all"
          ]
        }
      },
      {
        "system": false,
        "id": "kpavrrxf",
        "name": "desk_enabled",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "caew1g4n",
        "name": "is_active",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "ahznnhqu",
        "name": "granted_by",
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
        "id": "wf9k5mcl",
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
  const collection = dao.findCollectionByNameOrId("erp2zbl6h90n9ae");

  return dao.deleteCollection(collection);
})
