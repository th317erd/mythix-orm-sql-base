'use strict';

const { Model, Types } = require('mythix-orm');

class UserThing extends Model {
  static fields = {
    'id': {
      type:         Types.UUIDV4,
      defaultValue: Types.UUIDV4.Default.UUIDV4,
      allowNull:    false,
      primaryKey:   true,
    },
    'userID': {
      type:         Types.FOREIGN_KEY('User:id', { onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
      allowNull:    false,
      index:        true,
    },
    'roleThingID': {
      type:         Types.FOREIGN_KEY('RoleThing:id', { onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
      allowNull:    false,
      index:        true,
    },
    'roleThing': {
      type:         Types.Model(({ RoleThing, args, self }) => {
        let { query } = args;
        return RoleThing.$.id.EQ(self.roleThingID).MERGE(query);
      }),
    },
    'role': {
      type:         Types.Model(({ Role, RoleThing, args, self }) => {
        let { query } = args;
        return Role
          .$.id
            .EQ(RoleThing.$.roleID)
          .RoleThing.id
            .EQ(self.roleThingID)
          .MERGE(query);
      }),
    },
    'user': {
      type:         Types.Model('User:id', 'userID'),
    },
  };
}

module.exports = UserThing;
