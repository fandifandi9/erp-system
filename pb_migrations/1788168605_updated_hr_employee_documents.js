/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lqvscab0e26a1su")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2qmv48w8",
    "name": "verification_status",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "pending",
        "verified",
        "rejected",
        "needs_replacement"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lqvscab0e26a1su")

  // remove
  collection.schema.removeField("2qmv48w8")

  return dao.saveCollection(collection)
})
