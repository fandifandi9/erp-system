/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("37ul5t5hv3fu5uh")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "sjnvjyqd",
    "name": "file",
    "type": "file",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "mimeTypes": [
        "image/jpeg",
        "image/png",
        "image/webp"
      ],
      "thumbs": [
        "128x128"
      ],
      "maxSelect": 1,
      "maxSize": 10485760,
      "protected": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("37ul5t5hv3fu5uh")

  // remove
  collection.schema.removeField("sjnvjyqd")

  return dao.saveCollection(collection)
})
