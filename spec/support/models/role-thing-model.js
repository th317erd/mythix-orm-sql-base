'use strict';

const { Model, Types } = require('mythix-orm');

class RoleThing extends Model {
  static fields = {
    'id': {
      type:         Types.UUIDV4,
      defaultValue: Types.UUIDV4.Default.UUIDV4,
      allowNull:    false,
      primaryKey:   true,
    },
    'roleID': {
      type:         Types.FOREIGN_KEY('Role:id', { onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
      allowNull:    true,
      index:        true,
    },
    'userThing': {
      type:         Types.Model(({ UserThing, args, self }) => {
        let { query } = args;
        return UserThing.$.roleThingID.EQ(self.id).MERGE(query);
      }),
    },
    'role': {
      type:         Types.Model(({ Role, args, self }) => {
        let { query } = args;
        return Role.$.id.EQ(self.roleID).MERGE(query);
      }),
    },
    'user': {
      type:         Types.Model(({ UserThing, User, Role, args, self }) => {
        let { query } = args;

        return User
          .$.id
            .EQ(UserThing.userID)
          .UserThing.roleThingID
            .EQ(self.id)
          .MERGE(query);
      }),
    },
  };
}

module.exports = RoleThing;
