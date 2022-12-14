/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, it, expect, beforeAll */

const { Literals }    = require('mythix-orm');
const Connection      = require('../../../../lib/sql-connection-base');
const { SumLiteral, Literal } = Literals;

describe('SumLiteral', () => {
  let connection;
  let User;

  beforeAll(async () => {
    connection = new Connection({
      bindModels: false,
      models:     require('../../../support/models'),
    });

    let models = connection.getModels();

    User = models.User;
  });

  describe('toString', () => {
    it('can turn a fully qualified name into a min projection', () => {
      expect((new SumLiteral('User:id')).toString(connection)).toEqual('SUM("users"."id")');
    });

    it('will throw an exception if no field is present', () => {
      expect(() => (new SumLiteral()).toString(connection)).toThrow(new TypeError('SumLiteral::fullyQualifiedNameToDefinition: Unable to find field for fully qualified name "undefined".'));
    });

    it('can turn a raw field into a projection field', () => {
      expect((new SumLiteral(User.fields.firstName)).toString(connection)).toEqual('SUM("users"."firstName")');
    });

    it('can provide a SQL literal', () => {
      expect((new SumLiteral(new Literal('test'))).toString(connection)).toEqual('SUM(test)');
    });
  });
});
