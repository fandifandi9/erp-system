/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("13nanemw2kujr0c")

  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""
  collection.createRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.updateRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("13nanemw2kujr0c")

  collection.listRule = ""
  collection.viewRule = ""
  collection.createRule = ""
  collection.updateRule = ""
  collection.deleteRule = ""

  return dao.saveCollection(collection)
})
