/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, it, expect, beforeAll */

const { Literals }          = require('mythix-orm');
const { SQLiteConnection }  = require('../../../support/sqlite-connection');

describe('SQLiteConnection', () => {
  describe('connection management', () => {
    let connection;
    let User;
    let Role;

    beforeAll(async () => {
      connection = new SQLiteConnection({
        emulateBigIntAutoIncrement: true,
        bindModels:                 false,
        models:                     require('../../../support/models'),
      });

      let models = connection.getModels();

      User = models.User;
      Role = models.Role;
    });

    describe('getLiteralClassByName', () => {
      it('can return literal class', () => {
        expect(SQLiteConnection.getLiteralClassByName('distinct')).toBe(SQLiteConnection.Literals.DistinctLiteral);
        expect(SQLiteConnection.getLiteralClassByName('DISTINCT')).toBe(SQLiteConnection.Literals.DistinctLiteral);
        expect(SQLiteConnection.getLiteralClassByName('Distinct')).toBe(SQLiteConnection.Literals.DistinctLiteral);
        expect(SQLiteConnection.getLiteralClassByName('literal')).toBe(SQLiteConnection.Literals.Literal);
        expect(SQLiteConnection.getLiteralClassByName('LITERAL')).toBe(SQLiteConnection.Literals.Literal);
        expect(SQLiteConnection.getLiteralClassByName('base')).toBe(SQLiteConnection.Literals.LiteralBase);
      });
    });

    describe('Literal', () => {
      it('can instantiate a SQL literal', () => {
        expect(SQLiteConnection.Literal('distinct', 'User:firstName')).toBeInstanceOf(SQLiteConnection.Literals.DistinctLiteral);
      });

      it('can stringify a literal to SQL', () => {
        let literal = SQLiteConnection.Literal('distinct', 'User:firstName');
        expect(literal.toString(connection)).toEqual('DISTINCT "users"."firstName" AS "User:firstName"');
      });

      it('will stringify to class name if no connection given', () => {
        let literal = SQLiteConnection.Literal('distinct', 'User:firstName');
        expect(literal.toString()).toEqual('DistinctLiteral {}');
      });
    });

    describe('escape', () => {
      it('can escape a string value', () => {
        expect(connection.escape(User.fields.id, 'test "hello";')).toEqual('\'test "hello";\'');
      });

      it('can escape a integer value', () => {
        expect(connection.escape(User.fields.id, 10)).toEqual('10');
        expect(connection.escape(User.fields.id, -10)).toEqual('-10');
      });

      it('can escape a number value', () => {
        expect(connection.escape(User.fields.id, 10.345)).toEqual('10.345');
        expect(connection.escape(User.fields.id, -10.345)).toEqual('-10.345');
      });

      it('can escape a boolean value', () => {
        expect(connection.escape(User.fields.id, true)).toEqual('TRUE');
        expect(connection.escape(User.fields.id, false)).toEqual('FALSE');
      });

      it('should not escape a literal value', () => {
        expect(connection.escape(User.fields.id, new Literals.Literal('!$#%'))).toEqual('!$#%');
      });
    });

    describe('escapeID', () => {
      it('can escape a string value', () => {
        expect(connection.escapeID('test.derp')).toEqual('"test"."derp"');
      });

      it('should not escape a literal value', () => {
        expect(connection.escapeID(new Literals.Literal('!$#%'))).toEqual('!$#%');
      });
    });

    describe('dialect', () => {
      it('can return dialect', () => {
        expect(SQLiteConnection.dialect).toEqual('sqlite');
        expect(connection.dialect).toEqual('sqlite');
      });
    });

    describe('start', () => {
      it('can initiate a :memory: DB connection', async () => {
        expect(connection.db).toBe(null);
        await connection.start();
        expect(connection.db).not.toBe(null);
      });
    });

    describe('stop', () => {
      it('can shutdown a DB connection', async () => {
        let testConnection = new SQLiteConnection();

        expect(testConnection.db).toBe(null);
        await testConnection.start();
        expect(testConnection.db).not.toBe(null);

        await testConnection.stop();
        expect(testConnection.db).toBe(null);
      });
    });

    describe('generateSavePointName', () => {
      it('can generate a save point name', async () => {
        expect(connection.generateSavePointName()).toMatch(/SP[A-P]{32}/);
      });
    });

    describe('parseFieldProjection', () => {
      it('can parse a field projection and turn it into a field definition', async () => {
        let queryGenerator  = connection.getQueryGenerator();
        expect(queryGenerator.parseFieldProjection('"users"."id" AS "User:id"')).toEqual('User:id');
        expect(queryGenerator.parseFieldProjection('"users"."firstName" AS "User:firstName"')).toEqual('User:firstName');
      });

      it('can parse a field projection when it is a literal', async () => {
        let queryGenerator  = connection.getQueryGenerator();
        expect(queryGenerator.parseFieldProjection('DISTINCT "users"."id" AS "User:id"')).toEqual('User:id');
      });

      it('can parse a field projection when it is a non-standard format', async () => {
        let queryGenerator  = connection.getQueryGenerator();
        expect(queryGenerator.parseFieldProjection('COUNT("users"."id") AS "User:id"')).toEqual('User:id');
        expect(queryGenerator.parseFieldProjection('COUNT("users"."id")')).toEqual('User:id');
      });
    });

    describe('projectionToFieldMap', () => {
      it('can parse projection and turn it into a field map', async () => {
        let queryGenerator  = connection.getQueryGenerator();
        let sqlStatement    = queryGenerator.generateSelectStatement(User.where.firstName.EQ('Mary').OR.lastName.EQ(null).ORDER('firstName'));

        let result = queryGenerator.parseFieldProjectionToFieldMap(sqlStatement);
        expect(Array.from(result.keys())).toEqual([
          'User:firstName',
          'User:id',
          'User:lastName',
          'User:primaryRoleID',
        ]);

        expect(Array.from(result.values())).toEqual([
          '"users"."firstName" AS "User:firstName"',
          '"users"."id" AS "User:id"',
          '"users"."lastName" AS "User:lastName"',
          '"users"."primaryRoleID" AS "User:primaryRoleID"',
        ]);
      });
    });

    describe('findAllFieldsFromFieldProjectionMap', () => {
      it('will return all fields from projection map', async () => {
        let queryGenerator      = connection.getQueryGenerator();
        let sqlStatement        = queryGenerator.generateSelectStatement(User.where.id.EQ(Role.where.id).AND.firstName.EQ('Mary').OR.lastName.EQ(null).ORDER('User:firstName').PROJECT('*'));
        let projectionFieldMap  = queryGenerator.parseFieldProjectionToFieldMap(sqlStatement);

        expect(connection.findAllFieldsFromFieldProjectionMap(projectionFieldMap)).toEqual([
          Role.fields.id,
          Role.fields.name,
          User.fields.firstName,
          User.fields.id,
          User.fields.lastName,
          User.fields.primaryRoleID,
        ]);
      });

      it('will return the raw projection field as a string if field can not be found', async () => {
        let queryGenerator      = connection.getQueryGenerator();
        let sqlStatement        = queryGenerator.generateSelectStatement(User.where.id.EQ(Role.where.id).AND.firstName.EQ('Mary').OR.lastName.EQ(null).ORDER('User:firstName').PROJECT('*', new Literals.Literal('COUNT(*)')));
        let projectionFieldMap  = queryGenerator.parseFieldProjectionToFieldMap(sqlStatement);

        expect(connection.findAllFieldsFromFieldProjectionMap(projectionFieldMap)).toEqual([
          'COUNT(*)',
          Role.fields.id,
          Role.fields.name,
          User.fields.firstName,
          User.fields.id,
          User.fields.lastName,
          User.fields.primaryRoleID,
        ]);
      });
    });
  });
});
