/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("13nanemw2kujr0c")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ueugkl5j",
    "name": "company",
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
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("13nanemw2kujr0c")

  // remove
  collection.schema.removeField("ueugkl5j")

  return dao.saveCollection(collection)
})
