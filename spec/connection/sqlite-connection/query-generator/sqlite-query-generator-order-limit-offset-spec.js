/* eslint-disable indent */
/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, expect, beforeAll */

const { SQLiteConnection }  = require('../../../support/sqlite-connection');
const { createRunners }     = require('../../../support/test-helpers');

describe('SQLiteQueryGenerator', () => {
  let connection;
  let User;
  let Role;

  // eslint-disable-next-line no-unused-vars
  const { it, fit } = createRunners(() => connection);

  beforeAll(() => {
    connection = new SQLiteConnection({
      emulateBigIntAutoIncrement: true,
      bindModels:                 false,
      models:                     require('../../../support/models'),
    });

    let models = connection.getModels();
    User = models.User;
    Role = models.Role;
  });

  describe('generateOrderClause', () => {
    it('can generate proper order clause', () => {
      let queryGenerator = connection.getQueryGenerator();
      let query = User.where.ORDER.DESC('+id');

      expect(queryGenerator.generateOrderClause(query)).toEqual('ORDER BY "users"."id" DESC');
    });

    it('can generate proper order clause with a string literal', () => {
      let queryGenerator = connection.getQueryGenerator();
      let query = User.where.ORDER.DESC('+id').ORDER.ASC('+@test');

      expect(queryGenerator.generateOrderClause(query)).toEqual('ORDER BY "users"."id" DESC,test ASC');
    });

    it('can generate proper order clause with multiple orders', () => {
      let queryGenerator = connection.getQueryGenerator();
      let query = User.where.ORDER.DESC('+id').ORDER.ASC('+firstName');

      expect(queryGenerator.generateOrderClause(query)).toEqual('ORDER BY "users"."id" DESC,"users"."firstName" ASC');
    });

    it('should return an empty string if nothing was provided', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateOrderClause()).toEqual('');
      expect(queryGenerator.generateOrderClause([])).toEqual('');
      expect(queryGenerator.generateOrderClause([ null, false, '' ])).toEqual('');
    });
  });

  describe('generateGroupByClause', () => {
    it('can generate proper group by clause', () => {
      let queryGenerator = connection.getQueryGenerator();
      let query = User.where.GROUP_BY('+id');

      expect(queryGenerator.generateGroupByClause(query)).toEqual('GROUP BY "users"."id"');
    });

    it('can generate proper group by clause with a string literal', () => {
      let queryGenerator = connection.getQueryGenerator();
      let query = User.where.GROUP_BY('id', '+@test');

      expect(queryGenerator.generateGroupByClause(query)).toEqual('GROUP BY "users"."id",test');
    });

    it('can generate proper group by clause with multiple fields', () => {
      let queryGenerator = connection.getQueryGenerator();
      let query = User.where.GROUP_BY('id', 'firstName');

      expect(queryGenerator.generateGroupByClause(query)).toEqual('GROUP BY "users"."id","users"."firstName"');
    });

    it('should return an empty string if nothing was provided', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateGroupByClause()).toEqual('');
      expect(queryGenerator.generateGroupByClause([])).toEqual('');
      expect(queryGenerator.generateGroupByClause([ null, false, '' ])).toEqual('');
    });
  });

  describe('generateLimitClause', () => {
    it('can generate proper limit clause', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateLimitClause(50)).toEqual('LIMIT 50');
    });
  });

  describe('generateOffsetClause', () => {
    it('can generate proper offset clause', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateOffsetClause(50)).toEqual('OFFSET 50');
    });
  });

  describe('generateSelectOrderLimitOffset', () => {
    it('can generate proper order clause', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .LIMIT(100)
          .OFFSET(5)
          .ORDER.DESC([ 'id' ]),
      )).toEqual('ORDER BY "users"."id" DESC LIMIT 100 OFFSET 5');
    });

    it('can generate nothing', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1),
      )).toEqual('ORDER BY "users"."rowid" ASC');
    });

    it('can generate proper order clause with multiple orders', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .LIMIT(100)
          .OFFSET(5)
          .ORDER.ASC('id').ORDER.DESC('+firstName'),
      )).toEqual('ORDER BY "users"."id" ASC,"users"."firstName" DESC LIMIT 100 OFFSET 5');
    });

    it('will ignore the limit clause when limit is Infinity', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .LIMIT(Infinity)
          .OFFSET(5)
          .ORDER.ASC('id').ORDER.DESC('+firstName'),
      )).toEqual('ORDER BY "users"."id" ASC,"users"."firstName" DESC OFFSET 5');
    });

    it('will ignore the limit clause when limit is nothing', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .OFFSET(5)
          .ORDER.ASC('id').ORDER.DESC('+firstName'),
      )).toEqual('ORDER BY "users"."id" ASC,"users"."firstName" DESC OFFSET 5');
    });

    it('will ignore the offset clause when offset is nothing', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .LIMIT(10)
          .ORDER.ASC('id').ORDER.DESC('+firstName'),
      )).toEqual('ORDER BY "users"."id" ASC,"users"."firstName" DESC LIMIT 10');
    });

    it('will ignore the limit and offset clause when they are nothing', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .ORDER.ASC('id').ORDER.DESC('+firstName'),
      )).toEqual('ORDER BY "users"."id" ASC,"users"."firstName" DESC');
    });

    it('will ignore the order clause when order is nothing', () => {
      let queryGenerator = connection.getQueryGenerator();
      expect(queryGenerator.generateSelectOrderLimitOffset(
        User.where
          .primaryRoleID
            .EQ(1)
          .LIMIT(100)
          .OFFSET(10),
      )).toEqual('ORDER BY "users"."rowid" ASC LIMIT 100 OFFSET 10');
    });
  });
});
