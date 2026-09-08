/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "wma7duyzvrcnbie",
    "created": "2026-08-31 05:02:22.194Z",
    "updated": "2026-08-31 05:02:22.194Z",
    "name": "hr_employee_work_schedules",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "yww0zja6",
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
        "id": "hcqkt993",
        "name": "schedule",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "l4xxv3c092lm6wb",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "vkbblzwl",
        "name": "effective_from",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      },
      {
        "system": false,
        "id": "40kxp9ec",
        "name": "effective_to",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      },
      {
        "system": false,
        "id": "yto3ib9g",
        "name": "is_active",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "viewRule": "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "deleteRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("wma7duyzvrcnbie");

  return dao.deleteCollection(collection);
})
