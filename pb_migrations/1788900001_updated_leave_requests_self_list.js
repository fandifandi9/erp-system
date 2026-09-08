/// <reference path="../pb_data/types.d.ts" />
/**
 * FLEX-ORG-05-FIX — leave_requests list/view = self only.
 * HR operational reads must use scoped Next.js APIs (admin PB).
 * create/update/delete remain null (server-only writes).
 */
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("76lf8shuvri8eqf")

  collection.listRule = "@request.auth.id != \"\" && user = @request.auth.id"
  collection.viewRule = "@request.auth.id != \"\" && user = @request.auth.id"
  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("76lf8shuvri8eqf")

  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""
  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  return dao.saveCollection(collection)
})
