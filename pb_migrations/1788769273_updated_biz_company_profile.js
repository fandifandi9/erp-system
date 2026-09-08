/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gywovwhhhkjaj0i")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "mkcrodha",
    "name": "operating_mode",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "STANDALONE",
        "GROUP_MEMBER",
        "INDEPENDENT"
      ]
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "gcc6oyha",
    "name": "management_group",
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
  const collection = dao.findCollectionByNameOrId("gywovwhhhkjaj0i")

  // remove
  collection.schema.removeField("mkcrodha")

  // remove
  collection.schema.removeField("gcc6oyha")

  return dao.saveCollection(collection)
})
