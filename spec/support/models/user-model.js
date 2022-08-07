'use strict';

const { Model, Types } = require('mythix-orm');

class User extends Model {
  static fields = {
    'id': {
      type:         Types.UUIDV4,
      defaultValue: Types.UUIDV4.Default.UUIDV4,
      allowNull:    false,
      primaryKey:   true,
    },
    'firstName': {
      type:         Types.STRING(64),
      allowNull:    true,
      index:        true,
    },
    'lastName': {
      type:         Types.STRING(64),
      allowNull:    true,
      index:        true,
    },
    'primaryRoleID': {
      type:         Types.FOREIGN_KEY('Role:id', { onDelete: 'SET NULL', onUpdate: 'SET NULL' }),
      allowNull:    true,
    },
    'roles': {
      type:         Types.Models(({ Role, UserRole, args, self }) => {
        let { query } = args;

        return Role
          .$.id
            .EQ(UserRole.$.roleID)
          .UserRole.userID
            .EQ(self.id)
          .MERGE(query);
      }),
    },
    'userRoles': {
      type:         Types.Models(({ UserRole, args, self }) => {
        let { query } = args;
        return UserRole.$.userID.EQ(self.id).MERGE(query);
      }),
    },
    'userThing': {
      type:         Types.Model(({ UserThing, args, self }) => {
        let { query } = args;

        return UserThing
          .$.userID
            .EQ(self.id)
          .MERGE(query);
      }),
    },
    'userThingRole': {
      type:         Types.Model(({ Role, UserThing, RoleThing, args, self }) => {
        let { query } = args;

        return Role
          .$.id
            .EQ(RoleThing.$.roleID)
          .RoleThing.id
            .EQ(UserThing.$.roleThingID)
          .UserThing.userID
            .EQ(self.id)
          .MERGE(query);
      }),
    },
    'primaryRole': {
      type:         Types.Model(({ Role, args, self }) => {
        let { query } = args;
        return Role.$.id.EQ(self.primaryRoleID).MERGE(query);
      }),
    },
  };
}

module.exports = User;
