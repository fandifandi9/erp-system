/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("xrn8l2a539so60e")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "avtmth00lqx",
    "name": "avatar",
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
      "maxSize": 5242880,
      "protected": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "biomth00lqx",
    "name": "bio",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dobmth00lqx",
    "name": "date_of_birth",
    "type": "date",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": "",
      "max": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("xrn8l2a539so60e")

  // remove
  collection.schema.removeField("avtmth00lqx")

  // remove
  collection.schema.removeField("biomth00lqx")

  // remove
  collection.schema.removeField("dobmth00lqx")

  return dao.saveCollection(collection)
})
