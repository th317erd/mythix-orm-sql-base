/* eslint-disable indent */
/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, it, expect, beforeAll, fail */

const { Literals }          = require('mythix-orm');
const { SQLiteConnection }  = require('../../../support/sqlite-connection');

describe('SQLiteQueryGenerator', () => {
  let connection;
  let User;
  let ExtendedUser;
  let Role;

  beforeAll(() => {
    connection = new SQLiteConnection({
      emulateBigIntAutoIncrement: true,
      bindModels:                 false,
      models:                     require('../../../support/models'),
    });

    let models = connection.getModels();
    User = models.User;
    Role = models.Role;
    ExtendedUser = models.ExtendedUser;
  });

  describe('generateIndexName', () => {
    it('can generate an index name from a list of field names', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateIndexName(User, [ 'firstName', 'lastName' ]);
      expect(result).toEqual('"idx_users_firstName_lastName"');
    });

    it('can generate an index name from a list of fully qualified field names', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateIndexName(User, [ 'User:firstName', 'User:lastName' ]);
      expect(result).toEqual('"idx_users_firstName_lastName"');
    });

    it('will return empty if no fields are provided', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateIndexName(User)).toEqual('');
      expect(queryGenerator.generateIndexName(User, undefined)).toEqual('');
      expect(queryGenerator.generateIndexName(User, false)).toEqual('');
      expect(queryGenerator.generateIndexName(User, [])).toEqual('');
      expect(queryGenerator.generateIndexName(User, [ false, null, undefined ])).toEqual('');
    });

    it('should throw an error if the fully qualified field name specifies a different model', () => {
      let queryGenerator = connection.getQueryGenerator();

      try {
        queryGenerator.generateIndexName(User, [ 'User:firstName', 'Role:name' ]);
        fail('unreachable');
      } catch (error) {
        expect(error.message).toEqual('Model::getField: Can\'t find a field from another model. Field requested: "Role:name".');
      }
    });
  });

  describe('generateCreateIndexStatement', () => {
    it('can generate an statement from a list of field names', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateCreateIndexStatement(User, [ 'firstName', 'lastName' ]);
      expect(result).toEqual('CREATE INDEX "idx_users_firstName_lastName" ON "users" ("firstName","lastName")');
    });

    it('can generate an statement from a list of fully qualified field names', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateCreateIndexStatement(User, [ 'User:firstName', 'User:lastName' ]);
      expect(result).toEqual('CREATE INDEX "idx_users_firstName_lastName" ON "users" ("firstName","lastName")');
    });

    it('can generate an statement with CONCURRENTLY', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateCreateIndexStatement(User, [ 'firstName', 'lastName' ], { concurrently: true });
      expect(result).toEqual('CREATE INDEX CONCURRENTLY "idx_users_firstName_lastName" ON "users" ("firstName","lastName")');
    });

    it('can generate an statement with IF NOT EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateCreateIndexStatement(User, [ 'firstName', 'lastName' ], { ifNotExists: true });
      expect(result).toEqual('CREATE INDEX IF NOT EXISTS "idx_users_firstName_lastName" ON "users" ("firstName","lastName")');
    });

    it('can generate an statement with CONCURRENTLY and IF NOT EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateCreateIndexStatement(User, [ 'firstName', 'lastName' ], { concurrently: true, ifNotExists: true });
      expect(result).toEqual('CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_firstName_lastName" ON "users" ("firstName","lastName")');
    });

    it('will return empty if no fields are provided', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateCreateIndexStatement(User)).toEqual('');
      expect(queryGenerator.generateCreateIndexStatement(User, undefined)).toEqual('');
      expect(queryGenerator.generateCreateIndexStatement(User, false)).toEqual('');
      expect(queryGenerator.generateCreateIndexStatement(User, [])).toEqual('');
      expect(queryGenerator.generateCreateIndexStatement(User, [ false, null, undefined ])).toEqual('');
    });

    it('should throw an error if the fully qualified field name specifies a different model', () => {
      let queryGenerator = connection.getQueryGenerator();

      try {
        queryGenerator.generateCreateIndexStatement(User, [ 'User:firstName', 'Role:name' ]);
        fail('unreachable');
      } catch (error) {
        expect(error.message).toEqual('Model::getField: Can\'t find a field from another model. Field requested: "Role:name".');
      }
    });
  });

  describe('generateDropIndexStatement', () => {
    it('can generate an statement from a list of field names', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropIndexStatement(User, [ 'firstName', 'lastName' ]);
      expect(result).toEqual('DROP INDEX "idx_users_firstName_lastName" CASCADE');
    });

    it('can generate an statement from a list of fully qualified field names', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropIndexStatement(User, [ 'User:firstName', 'User:lastName' ]);
      expect(result).toEqual('DROP INDEX "idx_users_firstName_lastName" CASCADE');
    });

    it('can generate an statement with RESTRICT', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropIndexStatement(User, [ 'firstName', 'lastName' ], { cascade: false });
      expect(result).toEqual('DROP INDEX "idx_users_firstName_lastName" RESTRICT');
    });

    it('can generate an statement with CONCURRENTLY', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropIndexStatement(User, [ 'firstName', 'lastName' ], { concurrently: true });
      expect(result).toEqual('DROP INDEX CONCURRENTLY "idx_users_firstName_lastName" CASCADE');
    });

    it('can generate an statement with IF NOT EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropIndexStatement(User, [ 'firstName', 'lastName' ], { ifNotExists: true });
      expect(result).toEqual('DROP INDEX "idx_users_firstName_lastName" CASCADE');
    });

    it('can generate an statement with CONCURRENTLY and IF NOT EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropIndexStatement(User, [ 'firstName', 'lastName' ], { concurrently: true, ifNotExists: true });
      expect(result).toEqual('DROP INDEX CONCURRENTLY "idx_users_firstName_lastName" CASCADE');
    });

    it('will return empty if no fields are provided', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateDropIndexStatement(User)).toEqual('');
      expect(queryGenerator.generateDropIndexStatement(User, undefined)).toEqual('');
      expect(queryGenerator.generateDropIndexStatement(User, false)).toEqual('');
      expect(queryGenerator.generateDropIndexStatement(User, [])).toEqual('');
      expect(queryGenerator.generateDropIndexStatement(User, [ false, null, undefined ])).toEqual('');
    });

    it('should throw an error if the fully qualified field name specifies a different model', () => {
      let queryGenerator = connection.getQueryGenerator();

      try {
        queryGenerator.generateDropIndexStatement(User, [ 'User:firstName', 'Role:name' ]);
        fail('unreachable');
      } catch (error) {
        expect(error.message).toEqual('Model::getField: Can\'t find a field from another model. Field requested: "Role:name".');
      }
    });
  });

  describe('generateColumnIndexes', () => {
    it('can generate statements from an index specifier', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateColumnIndexes(User, User.fields.firstName);

      expect(result).toEqual([
        'CREATE INDEX "idx_users_firstName" ON "users" ("firstName")',
        'CREATE INDEX "idx_users_firstName_lastName" ON "users" ("firstName","lastName")',
      ]);

      result = queryGenerator.generateColumnIndexes(Role, Role.fields.name);
      expect(result).toEqual([
        'CREATE INDEX "idx_roles_name" ON "roles" ("name")',
      ]);
    });

    it('can generate statements from an index specifier with CONCURRENTLY', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateColumnIndexes(User, User.fields.firstName, { concurrently: true });

      expect(result).toEqual([
        'CREATE INDEX CONCURRENTLY "idx_users_firstName" ON "users" ("firstName")',
        'CREATE INDEX CONCURRENTLY "idx_users_firstName_lastName" ON "users" ("firstName","lastName")',
      ]);
    });

    it('can generate statements from an index specifier with IF NOT EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateColumnIndexes(User, User.fields.firstName, { ifNotExists: true });

      expect(result).toEqual([
        'CREATE INDEX IF NOT EXISTS "idx_users_firstName" ON "users" ("firstName")',
        'CREATE INDEX IF NOT EXISTS "idx_users_firstName_lastName" ON "users" ("firstName","lastName")',
      ]);
    });

    it('can generate statements from an index specifier with CONCURRENTLY and IF NOT EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateColumnIndexes(User, User.fields.firstName, { concurrently: true, ifNotExists: true });

      expect(result).toEqual([
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_firstName" ON "users" ("firstName")',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_firstName_lastName" ON "users" ("firstName","lastName")',
      ]);
    });
  });

  describe('generateColumnDeclarationStatement', () => {
    it('can generate a column declaration from a field', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateColumnDeclarationStatement(User, User.fields.firstName);

      expect(result).toEqual('"firstName" VARCHAR(64)');

      result = queryGenerator.generateColumnDeclarationStatement(User, User.fields.id);

      expect(result).toEqual('"id" VARCHAR(36) PRIMARY KEY NOT NULL');
    });

    it('will skip AUTOINCREMENT default if requested to do so', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateColumnDeclarationStatement(User, ExtendedUser.fields.id);

      expect(result).toEqual('"id" INTEGER PRIMARY KEY AUTOINCREMENT');

      result = queryGenerator.generateColumnDeclarationStatement(User, ExtendedUser.fields.id, { noAutoIncrementDefault: true });
      expect(result).toEqual('"id" INTEGER PRIMARY KEY');
    });
  });

  describe('generateAlterTableStatement', () => {
    it('can generate alter table statements', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterTableStatement(User, { tableName: 'other_users' });
      expect(result).toEqual([ 'ALTER TABLE "users" RENAME TO "other_users"' ]);
    });

    it('should generate nothing if the tableName is the same', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterTableStatement(User, { tableName: 'users' });
      expect(result).toEqual([]);
    });

    it('should generate nothing if the tableName is empty', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterTableStatement(User, { tableName: '' });
      expect(result).toEqual([]);
    });
  });

  describe('generateDropColumnStatement', () => {
    it('can generate a drop column statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropColumnStatement(User.fields.firstName);
      expect(result).toEqual('ALTER TABLE "users" DROP COLUMN "firstName" CASCADE');
    });

    it('can generate a drop column statement with IF EXISTS', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropColumnStatement(User.fields.firstName, { ifExists: true });
      expect(result).toEqual('ALTER TABLE "users" DROP COLUMN IF EXISTS "firstName" CASCADE');
    });

    it('can generate a drop column statement with RESTRICT', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropColumnStatement(User.fields.firstName, { cascade: false });
      expect(result).toEqual('ALTER TABLE "users" DROP COLUMN "firstName" RESTRICT');
    });

    it('can generate a drop column statement with IF EXISTS and RESTRICT', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateDropColumnStatement(User.fields.firstName, { ifExists: true, cascade: false });
      expect(result).toEqual('ALTER TABLE "users" DROP COLUMN IF EXISTS "firstName" RESTRICT');
    });
  });

  describe('generateAlterColumnRenameStatement', () => {
    it('can generate a rename column statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnRenameStatement(User.fields.firstName, { columnName: 'first_name' });
      expect(result).toEqual('ALTER TABLE "users" RENAME COLUMN "firstName" TO "first_name"');
    });
  });

  describe('generateAlterColumnSetOrDropNullConstraintStatement', () => {
    it('can generate a drop null constraint statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnSetOrDropNullConstraintStatement(Role.fields.name, { allowNull: true });
      expect(result).toEqual('ALTER TABLE "roles" ALTER COLUMN "name" DROP NOT NULL');
    });

    it('can generate an add null constraint statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnSetOrDropNullConstraintStatement(Role.fields.name, { allowNull: false });
      expect(result).toEqual('ALTER TABLE "roles" ALTER COLUMN "name" SET NOT NULL');
    });
  });

  describe('generateAlterColumnSetDefaultStatement', () => {
    it('can generate a drop default statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnSetDefaultStatement(User.fields.firstName, {}, undefined);
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" DROP DEFAULT');
    });

    it('can generate a set default statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnSetDefaultStatement(User.fields.firstName, {}, '\'test\'');
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" SET DEFAULT \'test\'');
    });
  });

  describe('generateAlterColumnChangeTypeStatement', () => {
    it('can generate a change column type statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnChangeTypeStatement(User.fields.firstName, {}, 'BIGINT');
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" SET DATA TYPE BIGINT');
    });
  });

  describe('generateAlterColumnChangePrimaryKeyConstraintStatement', () => {
    it('can generate a drop primary key statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnChangePrimaryKeyConstraintStatement(User.fields.firstName, { primaryKey: false });
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" DROP CONSTRAINT PRIMARY KEY');
    });

    it('can generate an add primary key statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnChangePrimaryKeyConstraintStatement(User.fields.firstName, { primaryKey: true });
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" ADD CONSTRAINT PRIMARY KEY');
    });
  });

  describe('generateAlterColumnChangeUniqueConstraintStatement', () => {
    it('can generate a drop primary key statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnChangeUniqueConstraintStatement(User.fields.firstName, { unique: false });
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" DROP CONSTRAINT UNIQUE');
    });

    it('can generate an add primary key statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnChangeUniqueConstraintStatement(User.fields.firstName, { unique: true });
      expect(result).toEqual('ALTER TABLE "users" ALTER COLUMN "firstName" ADD CONSTRAINT UNIQUE');
    });
  });

  describe('generateAddColumnStatement', () => {
    it('can generate an add column type statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAddColumnStatement(User.fields.id);
      expect(result).toEqual('ALTER TABLE "users" ADD COLUMN "id" VARCHAR(36) PRIMARY KEY NOT NULL');
    });
  });

  describe('generateAlterColumnStatements', () => {
    it('can generate a rename column statement', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(User.fields.id, { columnName: 'my_id' });
      expect(result).toEqual([ 'ALTER TABLE "users" RENAME COLUMN "id" TO "my_id"' ]);
    });

    it('won\'t generate a rename column statement if nothing changed', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(User.fields.id, { columnName: 'id' });
      expect(result).toEqual([]);
    });

    it('can generate a primary key change statement (drop)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(User.fields.id, { primaryKey: false });
      expect(result).toEqual([ 'ALTER TABLE "users" ALTER COLUMN "id" DROP CONSTRAINT PRIMARY KEY' ]);
    });

    it('can generate a primary key change statement (add)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(User.fields.firstName, { primaryKey: true });
      expect(result).toEqual([ 'ALTER TABLE "users" ALTER COLUMN "firstName" ADD CONSTRAINT PRIMARY KEY' ]);
    });

    it('won\'t generate a primary key change statement if nothing changed', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(User.fields.id, { primaryKey: true });
      expect(result).toEqual([]);
    });

    it('can generate a unique constraint change statement (drop)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(ExtendedUser.fields.email, { unique: false });
      expect(result).toEqual([ 'ALTER TABLE "extended_users" ALTER COLUMN "email" DROP CONSTRAINT UNIQUE' ]);
    });

    it('can generate a unique constraint change statement (add)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(Role.fields.name, { unique: true });
      expect(result).toEqual([ 'ALTER TABLE "roles" ALTER COLUMN "name" ADD CONSTRAINT UNIQUE' ]);
    });

    it('won\'t generate a unique constraint change statement if nothing changed', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(ExtendedUser.fields.email, { unique: true });
      expect(result).toEqual([]);
    });

    it('can generate new indexes (add)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(ExtendedUser.fields.firstName, { index: [ true, 'lastName', 'createdAt' ] });
      expect(result).toEqual([ 'CREATE INDEX "idx_extended_users_createdAt_firstName" ON "extended_users" ("firstName","createdAt")' ]);
    });

    it('can generate new indexes (drop)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(ExtendedUser.fields.firstName, { index: [ true ] });
      expect(result).toEqual([ 'DROP INDEX "idx_extended_users_firstName_lastName" CASCADE' ]);
    });

    it('can generate new indexes (mixed)', () => {
      let queryGenerator = connection.getQueryGenerator();
      let result = queryGenerator.generateAlterColumnStatements(ExtendedUser.fields.firstName, { index: [ true, 'createdAt' ] });
      expect(result).toEqual([
        'CREATE INDEX "idx_extended_users_createdAt_firstName" ON "extended_users" ("firstName","createdAt")',
        'DROP INDEX "idx_extended_users_firstName_lastName" CASCADE',
      ]);
    });
  });
});
