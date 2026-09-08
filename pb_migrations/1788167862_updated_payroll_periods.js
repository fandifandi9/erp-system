/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("w0gxn1vlbbtwunv")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "y1csr6i3",
    "name": "is_demo",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ovqxmaek",
    "name": "demo_seed_key",
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
  const collection = dao.findCollectionByNameOrId("w0gxn1vlbbtwunv")

  // remove
  collection.schema.removeField("y1csr6i3")

  // remove
  collection.schema.removeField("ovqxmaek")

  return dao.saveCollection(collection)
})
