/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "4r2vi5e6bgoetlq",
    "created": "2026-09-02 07:04:51.055Z",
    "updated": "2026-09-02 07:04:51.055Z",
    "name": "sys_user_module_entities",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "l4vfl1g1",
        "name": "assignment",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "erp2zbl6h90n9ae",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "lrckglij",
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
  const collection = dao.findCollectionByNameOrId("4r2vi5e6bgoetlq");

  return dao.deleteCollection(collection);
})
