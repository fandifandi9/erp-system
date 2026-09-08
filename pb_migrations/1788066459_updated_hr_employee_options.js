/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("g9vundbpq14yiuj")

  collection.createRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.updateRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("g9vundbpq14yiuj")

  collection.createRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role = \"owner\")"
  collection.updateRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\")"

  return dao.saveCollection(collection)
})
