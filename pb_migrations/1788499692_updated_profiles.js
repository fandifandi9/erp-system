/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("xrn8l2a539so60e")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "fbfgllff",
    "name": "org_position_id",
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

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("xrn8l2a539so60e")

  // remove
  collection.schema.removeField("fbfgllff")

  return dao.saveCollection(collection)
})
