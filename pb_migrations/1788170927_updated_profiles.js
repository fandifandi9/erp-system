/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("xrn8l2a539so60e")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "u3syevpu",
    "name": "payslip_pin_hash",
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
    "id": "m6zs5e13",
    "name": "payslip_pin_failed_attempts",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": true
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dsda3ohb",
    "name": "payslip_pin_locked_until",
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
  collection.schema.removeField("u3syevpu")

  // remove
  collection.schema.removeField("m6zs5e13")

  // remove
  collection.schema.removeField("dsda3ohb")

  return dao.saveCollection(collection)
})
