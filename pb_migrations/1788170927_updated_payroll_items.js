/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("aoa5pk41adlnze9")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "wlyggivm",
    "name": "attendance_policy_id",
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
    "id": "wkfpjxbv",
    "name": "attendance_policy_snapshot",
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
  const collection = dao.findCollectionByNameOrId("aoa5pk41adlnze9")

  // remove
  collection.schema.removeField("wlyggivm")

  // remove
  collection.schema.removeField("wkfpjxbv")

  return dao.saveCollection(collection)
})
