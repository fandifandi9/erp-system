/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "lqvscab0e26a1su",
    "created": "2026-08-31 09:17:42.553Z",
    "updated": "2026-08-31 09:17:42.553Z",
    "name": "hr_employee_documents",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "4ejzd7qv",
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
        "id": "cnrnfbuq",
        "name": "document_type",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "ktp",
            "npwp",
            "kk",
            "bank_account",
            "other"
          ]
        }
      },
      {
        "system": false,
        "id": "vqbrzdk0",
        "name": "file",
        "type": "file",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "mimeTypes": [
            "application/pdf",
            "image/jpeg",
            "image/png"
          ],
          "thumbs": null,
          "maxSelect": 1,
          "maxSize": 10485760,
          "protected": false
        }
      },
      {
        "system": false,
        "id": "fgbupo4m",
        "name": "original_name",
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
        "id": "khrxht8b",
        "name": "mime_type",
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
        "id": "fb1kbgdh",
        "name": "is_current",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "pjrnx1z2",
        "name": "replaced_at",
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
        "id": "10dlvuzo",
        "name": "uploaded_by",
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
    "listRule": "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "viewRule": "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "createRule": "@request.auth.id != \"\" && user = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "deleteRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("lqvscab0e26a1su");

  return dao.deleteCollection(collection);
})
