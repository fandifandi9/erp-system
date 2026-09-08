/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lqvscab0e26a1su")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "47wd63k7",
    "name": "replaced_document_id",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "lqvscab0e26a1su",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lqvscab0e26a1su")

  // remove
  collection.schema.removeField("47wd63k7")

  return dao.saveCollection(collection)
})
