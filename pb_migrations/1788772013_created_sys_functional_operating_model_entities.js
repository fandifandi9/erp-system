/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "2uip95xx34ce9gf",
    "created": "2026-09-07 09:06:53.550Z",
    "updated": "2026-09-07 09:06:53.550Z",
    "name": "sys_functional_operating_model_entities",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "eap84s1a",
        "name": "operating_model",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "rw3sucobnus4idn",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "6nigrpf5",
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
  const collection = dao.findCollectionByNameOrId("2uip95xx34ce9gf");

  return dao.deleteCollection(collection);
})
