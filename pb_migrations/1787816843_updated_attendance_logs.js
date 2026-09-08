/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "b8rzgxog",
    "name": "is_suspicious",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh")

  // remove
  collection.schema.removeField("b8rzgxog")

  return dao.saveCollection(collection)
})
