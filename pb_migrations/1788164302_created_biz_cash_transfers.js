/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "u5meuewuyc06bs5",
    "created": "2026-08-31 08:18:22.712Z",
    "updated": "2026-08-31 08:18:22.712Z",
    "name": "biz_cash_transfers",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "trfnomtgyuueo",
        "name": "transfer_no",
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
        "id": "trffrmtgyuueo",
        "name": "from_account",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "13nanemw2kujr0c",
          "cascadeDelete": false,
          "minSelect": 1,
          "maxSelect": 1,
          "displayFields": []
        }
      },
      {
        "system": false,
        "id": "trftomtgyuueo",
        "name": "to_account",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "13nanemw2kujr0c",
          "cascadeDelete": false,
          "minSelect": 1,
          "maxSelect": 1,
          "displayFields": []
        }
      },
      {
        "system": false,
        "id": "tramtmtgyuueo",
        "name": "amount",
        "type": "number",
        "required": true,
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
        "id": "trfdtmtgyuueo",
        "name": "transfer_date",
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
        "id": "trfntmtgyuueo",
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
        "id": "trfbymtgyuueo",
        "name": "created_by",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": false,
          "minSelect": 1,
          "maxSelect": 1,
          "displayFields": []
        }
      }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("u5meuewuyc06bs5");

  return dao.deleteCollection(collection);
})
