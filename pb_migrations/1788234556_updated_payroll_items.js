/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("aoa5pk41adlnze9")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "hor28gmv",
    "name": "bank_name_snapshot",
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
    "id": "wkn7zjya",
    "name": "bank_account_number_snapshot",
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
    "id": "abgwoxot",
    "name": "bank_account_holder_snapshot",
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
    "id": "yfbocvoz",
    "name": "bank_account_id_snapshot",
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
    "id": "lhwv6fvd",
    "name": "company_logo_snapshot",
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
  collection.schema.removeField("hor28gmv")

  // remove
  collection.schema.removeField("wkn7zjya")

  // remove
  collection.schema.removeField("abgwoxot")

  // remove
  collection.schema.removeField("yfbocvoz")

  // remove
  collection.schema.removeField("lhwv6fvd")

  return dao.saveCollection(collection)
})
