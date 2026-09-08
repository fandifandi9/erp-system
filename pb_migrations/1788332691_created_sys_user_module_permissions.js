/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "qd8zn3dddfs7sli",
    "created": "2026-09-02 07:04:50.991Z",
    "updated": "2026-09-02 07:04:50.991Z",
    "name": "sys_user_module_permissions",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "xkr05mtg",
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
        "id": "dpzgvqgd",
        "name": "permission_key",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 1,
          "max": 200,
          "pattern": ""
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
  const collection = dao.findCollectionByNameOrId("qd8zn3dddfs7sli");

  return dao.deleteCollection(collection);
})
