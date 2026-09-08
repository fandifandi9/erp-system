/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gakth3alimnr0oe")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "xh01cgar",
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
  const collection = dao.findCollectionByNameOrId("gakth3alimnr0oe")

  // remove
  collection.schema.removeField("xh01cgar")

  return dao.saveCollection(collection)
})
