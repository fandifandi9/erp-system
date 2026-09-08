/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("uk1k8olnuasg3vm")

  collection.createRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.updateRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("uk1k8olnuasg3vm")

  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  return dao.saveCollection(collection)
})
