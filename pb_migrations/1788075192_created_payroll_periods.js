/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "w0gxn1vlbbtwunv",
    "created": "2026-08-30 07:33:12.207Z",
    "updated": "2026-08-30 07:33:12.207Z",
    "name": "payroll_periods",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "1dqtasbe",
        "name": "name",
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
        "id": "q2tmclns",
        "name": "period_key",
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
        "id": "pdvbbx6w",
        "name": "start_date",
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
        "id": "iw0guokq",
        "name": "end_date",
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
        "id": "rskolu37",
        "name": "pay_date",
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
        "id": "jqzqfu7h",
        "name": "status",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "draft",
            "reviewed",
            "approved",
            "paid",
            "closed"
          ]
        }
      },
      {
        "system": false,
        "id": "gt9r2m9d",
        "name": "settings",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "b8m2bceajcgay42",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "lyymjmq0",
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
        "id": "gsgubeyg",
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
        "id": "70xnb58c",
        "name": "approved_by",
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
        "id": "70hqfdkr",
        "name": "approved_at",
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
        "id": "bwrurr6l",
        "name": "locked_at",
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
  const collection = dao.findCollectionByNameOrId("w0gxn1vlbbtwunv");

  return dao.deleteCollection(collection);
})
