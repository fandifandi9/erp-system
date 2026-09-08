/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh")

  collection.indexes = [
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_attendance_one_day_user` ON `attendance_logs` (\n  `user`,\n  `date`\n)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("74ehipbjhphjuoh")

  collection.indexes = []

  return dao.saveCollection(collection)
})
