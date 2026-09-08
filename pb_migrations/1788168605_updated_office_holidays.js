/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("q35nhinbnr4tpsm")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "vebuftjm",
    "name": "company_id",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "gywovwhhhkjaj0i",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "cg079sve",
    "name": "holiday_type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "national",
        "company",
        "collective_leave",
        "other"
      ]
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "oqextod0",
    "name": "description",
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
    "id": "huhabgez",
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
    "id": "pod2jdc5",
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
  const collection = dao.findCollectionByNameOrId("q35nhinbnr4tpsm")

  // remove
  collection.schema.removeField("vebuftjm")

  // remove
  collection.schema.removeField("cg079sve")

  // remove
  collection.schema.removeField("oqextod0")

  // remove
  collection.schema.removeField("huhabgez")

  // remove
  collection.schema.removeField("pod2jdc5")

  return dao.saveCollection(collection)
})
