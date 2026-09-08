/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "8inl7hpad8t5q2q",
    "created": "2026-08-30 07:33:12.275Z",
    "updated": "2026-08-30 07:33:12.275Z",
    "name": "payroll_adjustments",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "f46pyl6y",
        "name": "payroll_item",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "aoa5pk41adlnze9",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "vwqrozla",
        "name": "adjustment_type",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "addition",
            "deduction"
          ]
        }
      },
      {
        "system": false,
        "id": "bpbwdnna",
        "name": "component",
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
        "id": "bklfqfoa",
        "name": "amount",
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
        "id": "jhwj2e0b",
        "name": "reason",
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
        "id": "pxotgjhd",
        "name": "created_by",
        "type": "relation",
        "required": false,
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
        "id": "tnvqybfh",
        "name": "created_at",
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
    "listRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "deleteRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("8inl7hpad8t5q2q");

  return dao.deleteCollection(collection);
})
