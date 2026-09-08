/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gywovwhhhkjaj0i")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "cztg6ixv",
    "name": "logo",
    "type": "file",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "mimeTypes": [
        "image/jpeg",
        "image/png",
        "image/webp"
      ],
      "thumbs": [
        "100x100",
        "200x200"
      ],
      "maxSelect": 1,
      "maxSize": 2097152,
      "protected": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gywovwhhhkjaj0i")

  // remove
  collection.schema.removeField("cztg6ixv")

  return dao.saveCollection(collection)
})
