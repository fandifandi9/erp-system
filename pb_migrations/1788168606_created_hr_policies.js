/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "2xvn7oree8ag9mg",
    "created": "2026-08-31 09:30:06.189Z",
    "updated": "2026-08-31 09:30:06.189Z",
    "name": "hr_policies",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "rtmva3tq",
        "name": "company_id",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "gywovwhhhkjaj0i",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "4n3f6vft",
        "name": "title",
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
        "id": "lrln2yw8",
        "name": "category",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "kehadiran",
            "keterlambatan",
            "ketidakhadiran",
            "cuti",
            "lembur",
            "hari_libur",
            "penggajian",
            "potongan_gaji"
          ]
        }
      },
      {
        "system": false,
        "id": "qfvoso3u",
        "name": "content",
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
        "id": "m3oufxzj",
        "name": "status",
        "type": "select",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "draft",
            "published",
            "archived"
          ]
        }
      },
      {
        "system": false,
        "id": "nrqduzmw",
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
        "id": "yuzocmpn",
        "name": "published_by",
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
        "id": "l3tdscsw",
        "name": "published_at",
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
        "id": "cbsnq1r2",
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
        "id": "pv6j4dof",
        "name": "updated_by",
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
        "id": "4jybcvjm",
        "name": "is_demo",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "clg6vrek",
        "name": "demo_seed_key",
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
    "listRule": "@request.auth.id != \"\" && (status = \"published\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "viewRule": "@request.auth.id != \"\" && (status = \"published\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\" || @request.auth.role = \"hr\" || @request.auth.account_type = \"hr\")",
    "deleteRule": "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("2xvn7oree8ag9mg");

  return dao.deleteCollection(collection);
})
