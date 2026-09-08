/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("q8tw403j4cb5c3q")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "vdoakzyx",
    "name": "workspace_domain",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "hr",
        "finance",
        "warehouse",
        "purchasing",
        "sales",
        "pos",
        "director",
        "general"
      ]
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "30xga9gd",
    "name": "org_level_label",
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
  collection.schema.removeField("vdoakzyx")

  // remove
  collection.schema.removeField("30xga9gd")

  return dao.saveCollection(collection)
})
