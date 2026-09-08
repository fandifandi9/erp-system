/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "gkvxy3d8wiqzrke",
    "created": "2026-09-07 09:06:53.446Z",
    "updated": "2026-09-07 09:06:53.446Z",
    "name": "sys_management_group_entities",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "yaufi1mv",
        "name": "management_group",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "3sy4wnp8d6z3ys4",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "k1ungrgz",
        "name": "company",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "gywovwhhhkjaj0i",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
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
  const collection = dao.findCollectionByNameOrId("gkvxy3d8wiqzrke");

  return dao.deleteCollection(collection);
})
