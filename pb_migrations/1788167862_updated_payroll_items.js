/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("aoa5pk41adlnze9")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "qfu7x2zn",
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
    "id": "xbludqu0",
    "name": "company_name_snapshot",
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
    "id": "lzch90b1",
    "name": "company_code_snapshot",
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
    "id": "6d1eqj4n",
    "name": "entity_type_snapshot",
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
    "id": "1gy590wz",
    "name": "company_address_snapshot",
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
    "id": "h0bchtfh",
    "name": "company_npwp_snapshot",
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
    "id": "viflhceh",
    "name": "employee_code_snapshot",
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
    "id": "gvxmwipu",
    "name": "department_snapshot",
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
    "id": "q9giwtbq",
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
    "id": "2o8brbk0",
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
  const collection = dao.findCollectionByNameOrId("aoa5pk41adlnze9")

  // remove
  collection.schema.removeField("qfu7x2zn")

  // remove
  collection.schema.removeField("xbludqu0")

  // remove
  collection.schema.removeField("lzch90b1")

  // remove
  collection.schema.removeField("6d1eqj4n")

  // remove
  collection.schema.removeField("1gy590wz")

  // remove
  collection.schema.removeField("h0bchtfh")

  // remove
  collection.schema.removeField("viflhceh")

  // remove
  collection.schema.removeField("gvxmwipu")

  // remove
  collection.schema.removeField("q9giwtbq")

  // remove
  collection.schema.removeField("2o8brbk0")

  return dao.saveCollection(collection)
})
