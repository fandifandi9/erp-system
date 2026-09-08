/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("13nanemw2kujr0c")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "cshprmtgyuxh4",
    "name": "is_primary",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("13nanemw2kujr0c")

  // remove
  collection.schema.removeField("cshprmtgyuxh4")

  return dao.saveCollection(collection)
})
