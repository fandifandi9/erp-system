/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "74ehipbjhphjuoh",
    "created": "2026-08-27 07:17:04.147Z",
    "updated": "2026-08-27 07:17:04.147Z",
    "name": "attendance_logs",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "5rzopzvs",
        "name": "status",
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
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh");

  return dao.deleteCollection(collection);
})
