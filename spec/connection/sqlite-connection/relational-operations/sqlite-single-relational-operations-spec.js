/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, expect, beforeAll, afterEach, beforeAll */

const UUID = require('uuid');

const {
  UUID_REGEXP,
  createRunners,
} = require('../../../support/test-helpers');

const {
  createConnection,
  truncateTables,
} = require('../sqlite-connection-helper');

describe('SQLiteConnection', () => {
  describe('1x1 relational operations', () => {
    let connection;
    let User;
    let Role;
    let UserThing;
    let RoleThing;

    // eslint-disable-next-line no-unused-vars
    const { it, fit } = createRunners(() => connection);

    beforeAll(async () => {
      try {
        let setup = await createConnection();

        connection = setup.connection;
        User = setup.User;
        Role = setup.Role;
        UserThing = setup.UserThing;
        RoleThing = setup.RoleThing;
      } catch (error) {
        console.error('Error in "beforeAll": ', error);
      }
    });

    afterEach(async () => {
      await truncateTables(connection);
    });

    describe('create single-relational models', () => {
      it('can properly generate a query', async () => {
        let user = new User({
          id:            '664e9071-11d9-4544-85fe-1359ce1904b1',
          firstName:     'Mary',
          lastName:      'Anne',
          primaryRoleID: '5016a9dc-0271-41a0-937a-a0c95acd117b',
        });

        expect((await user.queryForUserThingRole()).toString()).toEqual('SELECT "roles"."id" AS "Role:id","roles"."name" AS "Role:name","roles"."rowid" AS "Role:rowid" FROM "roles" INNER JOIN "role_things" ON "role_things"."roleID" = "roles"."id" INNER JOIN "user_things" ON "user_things"."roleThingID" = "role_things"."id" WHERE "user_things"."userID" = \'664e9071-11d9-4544-85fe-1359ce1904b1\' ORDER BY "roles"."rowid" ASC');
      });

      it('can create a single model through a relational field', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne' }),
        ];

        await connection.insert(User, userModels);

        let user = await User.where.first();
        let primaryRole = await user.getPrimaryRole();
        expect(primaryRole).toBe(undefined);

        expect(user.primaryRoleID).toBe(null);
        primaryRole = await user.createPrimaryRole({ name: 'admin' });
        expect(user.primaryRoleID).not.toBe(null);
        expect(primaryRole).toBeInstanceOf(Role);
        expect(primaryRole.name).toEqual('admin');

        primaryRole = await user.getPrimaryRole();
        expect(primaryRole).toBeInstanceOf(Role);
        expect(primaryRole.name).toEqual('admin');
      });

      it('can create a single model through a relational field using a through table', async () => {
        let user = await User.create({ firstName: 'Space', lastName: 'Pants' });
        expect(user).toBeInstanceOf(User);
        expect(user.id).toMatch(UUID_REGEXP);

        expect(await UserThing.count()).toEqual(0);
        expect(await RoleThing.count()).toEqual(0);

        let storedRole = await user.createUserThingRole({ name: 'admin' });
        expect(storedRole).toBeInstanceOf(Role);

        expect(await UserThing.count()).toEqual(1);
        expect(await RoleThing.count()).toEqual(1);

        let userThing = await user.getUserThing(null);
        expect(userThing).toBeInstanceOf(UserThing);

        let roleThing = await userThing.getRoleThing();
        expect(roleThing).toBeInstanceOf(RoleThing);

        let role = await roleThing.getRole();
        expect(role).toBeInstanceOf(Role);

        expect(userThing.userID).toEqual(user.id);
        expect(userThing.roleThingID).toEqual(roleThing.id);
        expect(roleThing.roleID).toEqual(role.id);
        expect(role.id).toEqual(storedRole.id);
      });

      it('should update a single model through a relational field using a through table when through table models already exist', async () => {
        let user = await User.create({ firstName: 'Space', lastName: 'Pants' });
        expect(user).toBeInstanceOf(User);
        expect(user.id).toMatch(UUID_REGEXP);

        let role      = await Role.create({ name: 'admin' });
        let roleThing = await RoleThing.create({ roleID: role.id });
        await UserThing.create({ userID: user.id, roleThingID: roleThing.id });

        expect(await UserThing.count()).toEqual(1);
        expect(await RoleThing.count()).toEqual(1);

        role = await user.createUserThingRole({ name: 'admin' });
        expect(role).toBeInstanceOf(Role);
        expect(role.name).toEqual('admin');
      });

      it('should update a single model through a relational field when the "update" option is true', async () => {
        let user = await User.create({ firstName: 'Space', lastName: 'Pants' });
        expect(user).toBeInstanceOf(User);
        expect(user.id).toMatch(UUID_REGEXP);

        let role      = await Role.create({ name: 'admin' });
        let roleThing = await RoleThing.create({ roleID: role.id });
        await UserThing.create({ userID: user.id, roleThingID: roleThing.id });

        expect(await UserThing.count()).toEqual(1);
        expect(await RoleThing.count()).toEqual(1);
        expect(role.name).toEqual('admin');

        let result = await user.createUserThingRole({ name: 'test' }, { update: true });
        expect(result).toBeInstanceOf(Role);
        expect(result.name).toEqual('test');
      });
    });

    describe('get single model', () => {
      it('can fetch a single model through a relational field', async () => {
        let roleModels = [
          new Role({ name: 'member', id: UUID.v4() }),
          new Role({ name: 'admin', id: UUID.v4() }),
        ];

        let userModels = [
          new User({ firstName: 'Test', lastName: 'User', primaryRoleID: roleModels[0].id }),
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: roleModels[0].id }),
        ];

        await connection.insert(Role, roleModels);
        await connection.insert(User, userModels);

        let user = await User.where.first();
        expect(user).toBeInstanceOf(User);

        let primaryRole = await user.getPrimaryRole();
        expect(primaryRole).toBeInstanceOf(Role);
        expect(primaryRole.id).toEqual(roleModels[0].id);
        expect(primaryRole.name).toEqual(roleModels[0].name);
      });
    });

    describe('update single model', () => {
      it('can update a single model through a relational field', async () => {
        let roleModels = [
          new Role({ name: 'member', id: UUID.v4() }),
          new Role({ name: 'admin', id: UUID.v4() }),
        ];

        let userModels = [
          new User({ firstName: 'Test', lastName: 'User', primaryRoleID: roleModels[0].id }),
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: roleModels[0].id }),
        ];

        await connection.insert(Role, roleModels);
        await connection.insert(User, userModels);

        let user = await User.where.first();
        expect(user).toBeInstanceOf(User);

        let result = await user.updatePrimaryRole({ name: 'bigboy' });
        expect(result).toBeInstanceOf(Role);

        let primaryRole = await user.getPrimaryRole();
        expect(primaryRole).toBeInstanceOf(Role);
        expect(primaryRole.id).toEqual(roleModels[0].id);
        expect(primaryRole.name).toEqual('bigboy');
      });
    });

    describe('destroy single model', () => {
      it('can destroy a single model through a relational field', async () => {
        let roleModels = [
          new Role({ name: 'member', id: UUID.v4() }),
          new Role({ name: 'admin', id: UUID.v4() }),
        ];

        let userModels = [
          new User({ firstName: 'Test', lastName: 'User', primaryRoleID: roleModels[0].id }),
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: roleModels[0].id }),
        ];

        await connection.insert(Role, roleModels);
        await connection.insert(User, userModels);

        expect(await Role.where.count()).toEqual(2);

        let user = await User.where.first();
        let result = await user.destroyPrimaryRole();
        expect(result).toEqual(true);

        expect(await Role.where.count()).toEqual(1);
        expect(await User.where.count()).toEqual(2);

        user = await User.where.first();
        expect(user).toBeInstanceOf(User);
        expect(user.id).toEqual(userModels[0].id);
        expect(user.primaryRoleID).toEqual(null);
      });
    });
  });
});
