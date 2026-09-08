/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gywovwhhhkjaj0i")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "sjgncrix",
    "name": "entity_type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "PT",
        "CV",
        "FIRMA",
        "YAYASAN",
        "KOPERASI",
        "NON_PT",
        "OTHER"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gywovwhhhkjaj0i")

  // remove
  collection.schema.removeField("sjgncrix")

  return dao.saveCollection(collection)
})
