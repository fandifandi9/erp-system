/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3ynwec687nrx6vn")

  collection.createRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.updateRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "jgz8vdin",
    "name": "address",
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
    "id": "ojmk0mlx",
    "name": "max_checkin_distance",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "v8axe2vd",
    "name": "timezone",
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
  const collection = dao.findCollectionByNameOrId("3ynwec687nrx6vn")

  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  // remove
  collection.schema.removeField("jgz8vdin")

  // remove
  collection.schema.removeField("ojmk0mlx")

  // remove
  collection.schema.removeField("v8axe2vd")

  return dao.saveCollection(collection)
})
