/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("uk1k8olnuasg3vm")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "oauvy2xd",
    "name": "default_warehouse",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "3tpr9kejv8elrdb",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("uk1k8olnuasg3vm")

  // remove
  collection.schema.removeField("oauvy2xd")

  return dao.saveCollection(collection)
})
