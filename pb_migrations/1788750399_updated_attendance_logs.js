/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh")

  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh")

  collection.createRule = "@request.auth.id != \"\" && user = @request.auth.id"
  collection.updateRule = "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  return dao.saveCollection(collection)
})
