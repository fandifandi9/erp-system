/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("nev0l7sn7mq7jma")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_hr_org_assign_one_active_user` ON `hr_employee_org_assignments` (`user`) WHERE `is_active` IS TRUE"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("nev0l7sn7mq7jma")

  collection.indexes = []

  return dao.saveCollection(collection)
})
