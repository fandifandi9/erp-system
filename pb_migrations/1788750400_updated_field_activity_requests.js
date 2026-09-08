/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("osqd6k5jdi7qsjo")

  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("osqd6k5jdi7qsjo")

  collection.createRule = "@request.auth.id != \"\" && @request.data.user = @request.auth.id"
  collection.updateRule = "@request.auth.id != \"\" && ((user = @request.auth.id && status = \"pending_hr\") || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  return dao.saveCollection(collection)
})
