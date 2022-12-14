/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, beforeAll, afterEach, beforeAll, expect */

const {
  createConnection,
  truncateTables,
} = require('../sqlite-connection-helper');
const { createRunners } = require('../../../support/test-helpers');

describe('SQLiteConnection', () => {
  describe('one to many, or many to many relational operations', () => {
    let connection;
    let User;
    let Role;
    let UserRole;
    let ValidationTest;

    // eslint-disable-next-line no-unused-vars
    const { it, fit } = createRunners(() => connection);

    beforeAll(async () => {
      let setup = await createConnection();

      connection = setup.connection;
      User = setup.User;
      Role = setup.Role;
      UserRole = setup.UserRole;
      ValidationTest = setup.ValidationTest;
    });

    afterEach(async () => {
      await truncateTables(connection);
    });

    describe('join tables', () => {
      it('can join tables between models without defined relationships', async () => {
        await connection.insert(ValidationTest, [
          { number: '123', boolean: 'true', date: '2022-01-01' },
          { number: '567', boolean: 'false', date: '2022-02-02' },
        ]);

        await connection.insert(Role, { name: 'true' });

        let model = await ValidationTest.where.boolean.EQ(Role.where.name).first(null, { includeRelations: true });
        expect(model).toBeInstanceOf(ValidationTest);
        expect(model.number).toEqual('123');
        expect(model.boolean).toEqual('true');
        expect(model.date).toEqual('2022-01-01');
        expect(model.Roles).toBeInstanceOf(Array);
        expect(model.Roles[0]).toBeInstanceOf(Role);
        expect(model.Roles[0].name).toEqual('true');
      });
    });

    describe('create multi-relational models', () => {
      it('can create a single model for a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        let user = await User.where.first();

        expect(await Role.count()).toBe(0);
        expect(await UserRole.count()).toBe(0);

        let roles = await user.addToRoles({ name: 'admin' });
        expect(roles).toBeInstanceOf(Array);
        expect(roles.length).toEqual(1);
        expect(roles[0]).toBeInstanceOf(Role);
        expect(roles[0].isPersisted()).toEqual(true);
        expect(roles[0].name).toEqual('admin');
        expect(roles[0].Roles).toBe(undefined);
        expect(roles[0].Users).toBeInstanceOf(Array);
        expect(roles[0].Users.length).toEqual(1);
        expect(roles[0].Users[0]).toBeInstanceOf(User);
        expect(roles[0].Users[0]).toBe(user);
        expect(roles[0].UserRoles).toBeInstanceOf(Array);
        expect(roles[0].UserRoles.length).toEqual(1);
        expect(roles[0].UserRoles[0]).toBeInstanceOf(UserRole);
        expect(roles[0].UserRoles[0].isPersisted()).toEqual(true);
        expect(roles[0].UserRoles[0].userID).toEqual(user.id);
        expect(roles[0].UserRoles[0].roleID).toEqual(roles[0].id);

        expect(await Role.count()).toBe(1);
        expect(await UserRole.count()).toBe(1);
      });

      it('can create multiple models for a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        let user = await User.where.first();

        expect(await Role.count()).toBe(0);
        expect(await UserRole.count()).toBe(0);

        let persistedRole = await connection.insert(Role, { name: 'test' });
        expect(persistedRole.isPersisted()).toEqual(true);

        let roles = await user.addToRoles([
          { name: 'admin' },
          persistedRole,
          { name: 'test2' },
        ]);

        expect(roles).toBeInstanceOf(Array);
        expect(roles.length).toEqual(3);
        expect(roles[0].name).toEqual('admin');
        expect(roles[1].name).toEqual('test');
        expect(roles[2].name).toEqual('test2');

        for (let i = 0, il = roles.length; i < il; i++) {
          expect(roles[i]).toBeInstanceOf(Role);
          expect(roles[i].isPersisted()).toEqual(true);
          expect(roles[i].UserRoles).toBeInstanceOf(Array);
          expect(roles[i].UserRoles.length).toEqual(1);
          expect(roles[i].UserRoles[0]).toBeInstanceOf(UserRole);
          expect(roles[i].UserRoles[0].isPersisted()).toEqual(true);
          expect(roles[i].UserRoles[0].userID).toEqual(user.id);
          expect(roles[i].UserRoles[0].roleID).toEqual(roles[i].id);
        }

        expect(await Role.count()).toBe(3);
        expect(await UserRole.count()).toBe(3);
      });
    });

    describe('get multi-relational models', () => {
      it('can fetch multiple models from a relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        let user = await User.where.first();
        let persistedRole = await connection.insert(Role, { name: 'test' });

        await user.addToRoles([
          { name: 'admin' },
          persistedRole,
          { name: 'test2' },
        ]);

        let roles = await user.getRoles(Role.where.ORDER('Role:name'), { includeRelations: true });

        expect(roles).toBeInstanceOf(Array);
        expect(roles.length).toEqual(3);
        expect(roles[0].name).toEqual('admin');
        expect(roles[1].name).toEqual('test');
        expect(roles[2].name).toEqual('test2');

        for (let i = 0, il = roles.length; i < il; i++) {
          expect(roles[i]).toBeInstanceOf(Role);
          expect(roles[i].isPersisted()).toEqual(true);
          expect(roles[i].UserRoles).toBeInstanceOf(Array);
          expect(roles[i].UserRoles.length).toEqual(1);
          expect(roles[i].UserRoles[0]).toBeInstanceOf(UserRole);
          expect(roles[i].UserRoles[0].isPersisted()).toEqual(true);
          expect(roles[i].UserRoles[0].userID).toEqual(user.id);
          expect(roles[i].UserRoles[0].roleID).toEqual(roles[i].id);
        }

        expect(await Role.count()).toBe(3);
        expect(await UserRole.count()).toBe(3);

        expect(user.roles).toEqual(roles);
      });
    });

    describe('set multi-relational models', () => {
      it('can set models on a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        let user = await User.where.first();

        await user.addToRoles([
          { name: 'admin' },
          { name: 'test2' },
        ]);

        let roles = await user.getRoles(Role.where.ORDER('Role:name'));

        expect(roles).toBeInstanceOf(Array);
        expect(roles.length).toEqual(2);
        expect(roles[0].name).toEqual('admin');
        expect(roles[1].name).toEqual('test2');

        expect(await Role.count()).toBe(2);
        expect(await UserRole.count()).toBe(2);

        expect(user.roles).toEqual(roles);

        await user.setRoles([
          { name: 'new1' },
          { name: 'new2' },
        ]);

        expect(await Role.count()).toBe(4);
        expect(await UserRole.count()).toBe(2);

        roles = await user.getRoles(Role.where.ORDER('Role:name'));

        expect(roles).toBeInstanceOf(Array);
        expect(roles.length).toEqual(2);
        expect(roles[0].name).toEqual('new1');
        expect(roles[1].name).toEqual('new2');
      });
    });

    describe('removeFrom multi-relational models', () => {
      it('can remove persisted models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);

        let user = await User.where.first();
        let roles = await user.addToRoles([
          { name: 'admin' },
          { name: 'test2' },
        ]);

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(2);

        let removedCount = await user.removeFromRoles(roles);
        expect(removedCount).toEqual(2);

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(0);
      });

      it('can remove only specific persisted models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);

        let user = await User.where.first();
        let roles = await user.addToRoles([
          { name: 'admin' },
          { name: 'test2' },
        ]);

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(2);

        let removedCount = await user.removeFromRoles([ roles[0] ]);
        expect(removedCount).toEqual(1);

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(1);

        let updatedRoles = await user.getRoles(Role.where.ORDER('Role:name'));
        expect(updatedRoles).toBeInstanceOf(Array);
        expect(updatedRoles.length).toEqual(1);
        expect(updatedRoles[0].id).toEqual(roles[1].id);
        expect(updatedRoles[0].name).toEqual('test2');
      });

      it('can remove only specific non-persisted models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);
        expect(await UserRole.count()).toEqual(0);

        let user = await User.where.first();
        let roles = await user.addToRoles([
          { name: 'admin' },
          { name: 'test2' },
        ]);

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(2);

        let removedCount = await user.removeFromRoles({ name: 'admin' });
        expect(removedCount).toEqual(1);

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(1);

        let updatedRoles = await user.getRoles(Role.where.ORDER('Role:name'));
        expect(updatedRoles).toBeInstanceOf(Array);
        expect(updatedRoles.length).toEqual(1);
        expect(updatedRoles[0].id).toEqual(roles[1].id);
        expect(updatedRoles[0].name).toEqual('test2');
      });
    });

    describe('destroy multi-relational models', () => {
      it('can destroy models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);
        expect(await UserRole.count()).toEqual(0);

        // Insert some roles to ensure they
        // aren't deleted erroneously
        await connection.insert(Role, [
          { name: 'safe1' },
          { name: 'safe2' },
        ]);

        let user = await User.where.first();
        await user.addToRoles([
          { name: 'admin' },
          { name: 'test' },
        ]);

        expect(await Role.count()).toEqual(4);
        expect(await UserRole.count()).toEqual(2);

        await user.destroyRoles();

        expect(await Role.count()).toEqual(2);
        expect(await UserRole.count()).toEqual(0);

        let allRoles = await Role.where.ORDER('name').all();
        expect(allRoles).toBeInstanceOf(Array);
        expect(allRoles.length).toEqual(2);
        expect(allRoles[0].name).toEqual('safe1');
        expect(allRoles[1].name).toEqual('safe2');
      });

      it('can destroy specific models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);
        expect(await UserRole.count()).toEqual(0);

        // Insert some roles to ensure they
        // aren't deleted erroneously
        await connection.insert(Role, [
          { name: 'safe1' },
          { name: 'safe2' },
        ]);

        let user = await User.where.first();
        await user.addToRoles([
          { name: 'admin' },
          { name: 'test' },
        ]);

        expect(await Role.count()).toEqual(4);
        expect(await UserRole.count()).toEqual(2);

        await user.destroyRoles({ name: 'admin' });

        expect(await Role.count()).toEqual(3);
        expect(await UserRole.count()).toEqual(1);

        let allRoles = await Role.where.ORDER('name').all();
        expect(allRoles).toBeInstanceOf(Array);
        expect(allRoles.length).toEqual(3);
        expect(allRoles[0].name).toEqual('safe1');
        expect(allRoles[1].name).toEqual('safe2');
        expect(allRoles[2].name).toEqual('test');
      });

      it('can destroy specific models with a query from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);
        expect(await UserRole.count()).toEqual(0);

        // Insert some roles to ensure they
        // aren't deleted erroneously
        await connection.insert(Role, [
          { name: 'safe1' },
          { name: 'safe2' },
        ]);

        let user = await User.where.first();
        await user.addToRoles([
          { name: 'admin' },
          { name: 'test' },
        ]);

        expect(await Role.count()).toEqual(4);
        expect(await UserRole.count()).toEqual(2);

        await user.destroyRoles(Role.where.name.EQ('admin'));

        expect(await Role.count()).toEqual(3);
        expect(await UserRole.count()).toEqual(1);

        let allRoles = await Role.where.ORDER('name').all();
        expect(allRoles).toBeInstanceOf(Array);
        expect(allRoles.length).toEqual(3);
        expect(allRoles[0].name).toEqual('safe1');
        expect(allRoles[1].name).toEqual('safe2');
        expect(allRoles[2].name).toEqual('test');
      });
    });

    describe('count multi-relational models', () => {
      it('can count models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);
        expect(await UserRole.count()).toEqual(0);

        // Insert some roles to ensure they
        // aren't deleted erroneously
        await connection.insert(Role, [
          { name: 'safe1' },
          { name: 'safe2' },
        ]);

        let user = await User.where.first();
        await user.addToRoles([
          { name: 'admin' },
          { name: 'test' },
        ]);

        expect(await Role.count()).toEqual(4);
        expect(await UserRole.count()).toEqual(2);

        let count = await user.countRoles();
        expect(count).toEqual(2);
      });
    });

    describe('has multi-relational models', () => {
      it('can check for existence of models from a multi-relational set', async () => {
        let userModels = [
          new User({ firstName: 'Mary', lastName: 'Anne', primaryRoleID: null }),
        ];

        await connection.insert(User, userModels);

        expect(await Role.count()).toEqual(0);
        expect(await UserRole.count()).toEqual(0);

        // Insert some roles to ensure they
        // aren't deleted erroneously
        await connection.insert(Role, [
          { name: 'safe1' },
          { name: 'safe2' },
        ]);

        let user = await User.where.first();

        expect(await user.hasRoles()).toEqual(false);

        await user.addToRoles([
          { name: 'admin' },
          { name: 'test' },
        ]);

        expect(await Role.count()).toEqual(4);
        expect(await UserRole.count()).toEqual(2);

        expect(await user.hasRoles()).toEqual(true);
      });
    });

  });
});
