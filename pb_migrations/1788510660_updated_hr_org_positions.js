/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("q8tw403j4cb5c3q")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "whcg8jr3",
    "name": "scope_type",
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
    "id": "nubtsyal",
    "name": "scope_company_ids",
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
  const collection = dao.findCollectionByNameOrId("q8tw403j4cb5c3q")

  // remove
  collection.schema.removeField("whcg8jr3")

  // remove
  collection.schema.removeField("nubtsyal")

  return dao.saveCollection(collection)
})
