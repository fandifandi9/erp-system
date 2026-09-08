/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")

  collection.updateRule = "@request.auth.id != \"\" && ((@request.auth.id = id && @request.data.role:isset = false && @request.data.role_code:isset = false && @request.data.account_type:isset = false && @request.data.dashboard_access:isset = false && @request.data.status:isset = false && @request.data.inventory_role:isset = false && @request.data.hr_role_preset:isset = false && @request.data.web_access:isset = false && @request.data.active_company:isset = false && @request.data.default_company:isset = false && @request.data.active_store:isset = false && @request.data.default_store:isset = false && @request.data.active_warehouse:isset = false && @request.data.default_warehouse:isset = false && @request.data.is_checked_in:isset = false && @request.data.shift_active:isset = false && @request.data.last_checkin:isset = false && @request.data.last_checkout:isset = false && @request.data.locale:isset = false && @request.data.name:isset = false && @request.data.email:isset = false && @request.data.emailVisibility:isset = false && @request.data.verified:isset = false && @request.data.oldPassword:isset = false && @request.data.password:isset = false && @request.data.passwordConfirm:isset = false) || (@request.auth.account_type = \"owner\" || @request.auth.role = \"owner\"))"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")

  collection.updateRule = "@request.auth.id != \"\" && (@request.auth.id = id || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.account_type = \"owner\")"

  return dao.saveCollection(collection)
})
