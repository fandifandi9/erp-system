/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "wlrb2yq9s8c4sos",
    "created": "2026-09-01 03:49:15.544Z",
    "updated": "2026-09-01 03:49:15.544Z",
    "name": "hr_payroll_bank_accounts",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "70ih1krn",
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
        "id": "0i0hdzzl",
        "name": "bank_name",
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
        "id": "8rgthcte",
        "name": "account_number",
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
        "id": "9qjxmdjy",
        "name": "account_holder_name",
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
        "id": "3xeoedwe",
        "name": "status",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "active",
            "pending",
            "inactive",
            "rejected"
          ]
        }
      },
      {
        "system": false,
        "id": "a3owjxs4",
        "name": "note",
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
        "id": "e1adp6lz",
        "name": "evidence_document_id",
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
        "id": "wwkqwvbq",
        "name": "effective_at",
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
        "id": "cna33byz",
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
        "id": "c8e6h79p",
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
        "id": "j01necoi",
        "name": "rejected_by",
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
        "id": "1ozsmtlf",
        "name": "rejected_at",
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
        "id": "hwhnai11",
        "name": "rejection_reason",
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
    "listRule": "@request.auth.id != \"\" && (user = @request.auth.id || (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\"))",
    "viewRule": "@request.auth.id != \"\" && (user = @request.auth.id || (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\"))",
    "createRule": "@request.auth.id != \"\" && user = @request.auth.id && status = \"pending\"",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("wlrb2yq9s8c4sos");

  return dao.deleteCollection(collection);
})
