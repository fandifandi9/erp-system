/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("q8tw403j4cb5c3q")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dbpz1lzv",
    "name": "parent_position",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "q8tw403j4cb5c3q",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("q8tw403j4cb5c3q")

  // remove
  collection.schema.removeField("dbpz1lzv")

  return dao.saveCollection(collection)
})
